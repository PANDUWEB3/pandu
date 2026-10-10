import { randomUUID } from 'node:crypto';

const SAFE_JOB_FIELDS = new Set(['state', 'nonce', 'tx_hash', 'attempts', 'error_code', 'updated_at']);

function queueError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export class MemoryRelayerJobStore {
  constructor() { this.records = new Map(); }
  async createOrLoad(key, metadata) {
    if (this.records.has(key)) return { record: this.records.get(key), created: false };
    const record = { idempotency_key: key, ...metadata, state: 'queued', attempts: 0, updated_at: new Date().toISOString() };
    this.records.set(key, record);
    return { record, created: true };
  }
  async claim(key) {
    const record = this.records.get(key);
    if (!record || !['queued', 'failed'].includes(record.state)) return false;
    record.state = 'submitting'; record.updated_at = new Date().toISOString();
    return true;
  }
  async update(key, patch) {
    const record = this.records.get(key);
    if (record) Object.assign(record, patch, { updated_at: new Date().toISOString() });
  }
}

/** Distributed per-wallet nonce lock. The lease is renewed while a transaction is pending. */
export class RedisWalletLock {
  constructor({ url, leaseMs = 180_000, acquireTimeoutMs = 15_000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), redisFactory }) {
    this.url = url;
    this.leaseMs = leaseMs;
    this.acquireTimeoutMs = acquireTimeoutMs;
    this.sleep = sleep;
    this.redisFactory = redisFactory;
    this.clientPromise = null;
  }

  async #client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        if (this.redisFactory) return this.redisFactory(this.url);
        const { default: Redis } = await import('ioredis');
        const client = new Redis(this.url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 3000 });
        await client.connect();
        return client;
      })();
    }
    try { return await this.clientPromise; }
    catch (error) { this.clientPromise = null; throw error; }
  }

  async ready() {
    try { return await (await this.#client()).ping() === 'PONG'; }
    catch { return false; }
  }

  async run(walletAddress, work) {
    const client = await this.#client();
    const key = `pandu:relayer:nonce:${walletAddress.toLowerCase()}`;
    const owner = randomUUID();
    const deadline = Date.now() + this.acquireTimeoutMs;
    let acquired = false;
    while (!acquired && Date.now() < deadline) {
      acquired = await client.set(key, owner, 'PX', this.leaseMs, 'NX') === 'OK';
      if (!acquired) await this.sleep(100);
    }
    if (!acquired) throw queueError('RELAYER_NONCE_LOCK_UNAVAILABLE');

    const renewScript = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) else return 0 end";
    const releaseScript = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
    const timer = setInterval(() => client.eval(renewScript, 1, key, owner, this.leaseMs).catch(() => {}), Math.floor(this.leaseMs / 3));
    timer.unref();
    try { return await work(); }
    finally {
      clearInterval(timer);
      await client.eval(releaseScript, 1, key, owner).catch(() => {});
    }
  }
}

export class SupabaseRelayerJobStore {
  constructor(supabaseAdmin) { this.supabase = supabaseAdmin; }
  async createOrLoad(key, metadata) {
    const insert = await this.supabase.from('relayer_jobs').insert({ idempotency_key: key, ...metadata, state: 'queued' }).select('*').single();
    if (!insert.error) return { record: insert.data, created: true };
    if (insert.error.code !== '23505') throw queueError('RELAYER_JOB_STORE_UNAVAILABLE');
    const existing = await this.supabase.from('relayer_jobs').select('*').eq('idempotency_key', key).maybeSingle();
    if (existing.error || !existing.data) throw queueError('RELAYER_JOB_STORE_UNAVAILABLE');
    return { record: existing.data, created: false };
  }
  async claim(key) {
    const result = await this.supabase.from('relayer_jobs')
      .update({ state: 'submitting', updated_at: new Date().toISOString() })
      .eq('idempotency_key', key).in('state', ['queued', 'failed']).select('idempotency_key').maybeSingle();
    if (result.error) throw queueError('RELAYER_JOB_STORE_UNAVAILABLE');
    return Boolean(result.data);
  }
  async update(key, patch) {
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([field]) => SAFE_JOB_FIELDS.has(field)));
    const result = await this.supabase.from('relayer_jobs').update({ ...safePatch, updated_at: new Date().toISOString() }).eq('idempotency_key', key);
    if (result.error) throw queueError('RELAYER_JOB_STORE_UNAVAILABLE');
  }
}

function bumped(value) {
  if (value === null || value === undefined) return undefined;
  return (BigInt(value) * 1125n + 999n) / 1000n;
}

export class RelayerTransactionQueue {
  constructor({
    store = new MemoryRelayerJobStore(), lockManager = null, maxGasLimit = 1_500_000n, lowBalanceWei = 50_000_000_000_000_000n,
    maxRetries = 3, receiptTimeoutMs = 30_000, confirmations = 1, retryBaseMs = 250, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {}) {
    this.store = store;
    this.lockManager = lockManager;
    this.maxGasLimit = BigInt(maxGasLimit);
    this.lowBalanceWei = BigInt(lowBalanceWei);
    this.maxRetries = maxRetries;
    this.receiptTimeoutMs = receiptTimeoutMs;
    this.confirmations = confirmations;
    this.retryBaseMs = retryBaseMs;
    this.sleep = sleep;
    this.serialTails = new Map();
    this.inFlight = new Map();
    this.completed = new Map();
  }

  submit({ proofId, operation, wallet, provider, estimateGas, send, contractAddress }) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(proofId || '') || !operation || !wallet?.address || !provider || !estimateGas || !send) {
      return Promise.reject(queueError('RELAYER_JOB_INVALID'));
    }
    const key = `${operation}:${String(proofId).toLowerCase()}`;
    if (this.completed.has(key)) return Promise.resolve(this.completed.get(key));
    if (this.inFlight.has(key)) return this.inFlight.get(key);

    const account = wallet.address.toLowerCase();
    const previous = this.serialTails.get(account) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => this.lockManager
      ? this.lockManager.run(account, () => this.#run({ key, proofId, operation, wallet, provider, estimateGas, send, contractAddress }))
      : this.#run({ key, proofId, operation, wallet, provider, estimateGas, send, contractAddress }));
    this.serialTails.set(account, task.catch(() => {}));
    this.inFlight.set(key, task);
    task.then((result) => {
      this.completed.set(key, result);
      while (this.completed.size > 1000) this.completed.delete(this.completed.keys().next().value);
    }).finally(() => this.inFlight.delete(key)).catch(() => {});
    return task;
  }

  async #run(job) {
    const { key, proofId, operation, wallet, provider, estimateGas, send } = job;
    const network = await provider.getNetwork();
    const identity = {
      chain_id: Number(network.chainId),
      contract_address: String(job.contractAddress || '').toLowerCase() || null,
      proof_id: proofId.toLowerCase(), operation,
    };
    const { record } = await this.store.createOrLoad(key, identity);
    if (record.state === 'confirmed' && record.tx_hash) {
      const receipt = await provider.getTransactionReceipt(record.tx_hash);
      if (receipt?.status === 1) return { tx: { hash: record.tx_hash }, receipt };
      throw queueError('RELAYER_JOB_ALREADY_CONFIRMED');
    }
    if (record.state === 'pending' && record.tx_hash) {
      let receipt = await provider.getTransactionReceipt(record.tx_hash);
      if (!receipt) {
        try { receipt = await provider.waitForTransaction(record.tx_hash, 1, this.receiptTimeoutMs); } catch { /* checked below */ }
      }
      if (receipt?.status === 1) {
        await this.store.update(key, { state: 'confirmed', error_code: null });
        return { tx: { hash: record.tx_hash }, receipt };
      }
      if (receipt?.status === 0) await this.store.update(key, { state: 'failed', error_code: 'TX_REVERTED' });
      else throw queueError('RELAYER_JOB_IN_PROGRESS');
    }
    if (record.state === 'submitting') throw queueError('RELAYER_JOB_RECONCILIATION_REQUIRED');
    if (!(await this.store.claim(key))) throw queueError('RELAYER_JOB_IN_PROGRESS');

    let nonce;
    let tx;
    let attempts = 0;
    try {
      const balance = await provider.getBalance(wallet.address);
      if (BigInt(balance) < this.lowBalanceWei) {
        console.warn(JSON.stringify({ level: 'warn', event: 'relayer_low_balance', chainId: Number(network.chainId) }));
      }
      const estimate = BigInt(await estimateGas());
      if (estimate <= 0n || estimate > this.maxGasLimit) throw queueError('RELAYER_GAS_LIMIT_EXCEEDED');
      const gasLimit = (estimate * 120n + 99n) / 100n;
      if (gasLimit > this.maxGasLimit) throw queueError('RELAYER_GAS_LIMIT_EXCEEDED');

      nonce = await provider.getTransactionCount(wallet.address, 'pending');
      for (attempts = 1; attempts <= this.maxRetries; attempts += 1) {
        try {
          tx = await send({ nonce, gasLimit });
          break;
        } catch (error) {
          if (error?.code === 'CALL_EXCEPTION' || error?.code === 'ACTION_REJECTED' || error?.code === 'RELAYER_GAS_LIMIT_EXCEEDED') throw error;
          if (attempts >= this.maxRetries) throw queueError('RELAYER_SEND_FAILED');
          await this.sleep(this.retryBaseMs * (2 ** (attempts - 1)));
        }
      }

      await this.store.update(key, { state: 'pending', nonce, tx_hash: tx.hash, attempts, error_code: null });
      let currentTx = tx;
      for (let replacement = 0; replacement <= 1; replacement += 1) {
        let receipt = null;
        try { receipt = await provider.waitForTransaction(currentTx.hash, this.confirmations, this.receiptTimeoutMs); } catch { /* checked below */ }
        if (receipt?.status === 1) {
          await this.store.update(key, { state: 'confirmed', tx_hash: currentTx.hash, error_code: null });
          return { tx: currentTx, receipt };
        }
        if (receipt?.status === 0) {
          await this.store.update(key, { state: 'failed', error_code: 'TX_REVERTED' });
          throw queueError('RELAYER_TX_REVERTED');
        }
        if (replacement === 1) break;
        console.warn(JSON.stringify({ level: 'warn', event: 'relayer_tx_stuck', chainId: Number(network.chainId) }));
        const pending = await provider.getTransaction(currentTx.hash);
        if (!pending || Number(pending.nonce) !== Number(nonce)) break;
        const replacementRequest = {
          to: pending.to, data: pending.data, value: pending.value, nonce,
          chainId: Number(network.chainId), gasLimit: pending.gasLimit,
          gasPrice: bumped(pending.gasPrice),
          maxFeePerGas: bumped(pending.maxFeePerGas),
          maxPriorityFeePerGas: bumped(pending.maxPriorityFeePerGas),
          accessList: pending.accessList,
        };
        for (const field of Object.keys(replacementRequest)) if (replacementRequest[field] === undefined || replacementRequest[field] === null) delete replacementRequest[field];
        currentTx = await wallet.sendTransaction(replacementRequest);
        await this.store.update(key, { state: 'pending', tx_hash: currentTx.hash, attempts: attempts + 1, error_code: 'TX_REPLACED' });
      }
      await this.store.update(key, { state: 'pending', tx_hash: currentTx.hash, attempts, error_code: 'TX_STUCK' });
      throw queueError('RELAYER_TX_STUCK');
    } catch (error) {
      if (error?.code !== 'RELAYER_TX_STUCK' && error?.code !== 'RELAYER_TX_REVERTED') {
        const ambiguousSend = !tx && attempts > 0 && !['CALL_EXCEPTION', 'ACTION_REJECTED'].includes(error?.code);
        try { await this.store.update(key, { state: tx ? 'pending' : ambiguousSend ? 'submitting' : 'failed', nonce: nonce ?? null, tx_hash: tx?.hash ?? null, attempts, error_code: ambiguousSend ? 'SEND_OUTCOME_UNKNOWN' : String(error?.code || 'RELAYER_ERROR').slice(0, 80) }); } catch { /* keep original error */ }
      }
      throw error;
    }
  }
}
