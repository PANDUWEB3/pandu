import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRelayerJobStore, RedisWalletLock, RelayerTransactionQueue } from '../src/services/relayer-queue.js';

const proofId = `0x${'11'.repeat(32)}`;
const account = '0x0000000000000000000000000000000000000001';

function fixture(overrides = {}) {
  let nonce = 4;
  const sent = [];
  const provider = {
    getNetwork: async () => ({ chainId: 421614n }),
    getBalance: async () => 10n ** 18n,
    getTransactionCount: async () => nonce,
    getTransactionReceipt: async () => null,
    waitForTransaction: async (hash) => ({ status: 1, transactionHash: hash }),
    getTransaction: async () => null,
    ...overrides.provider,
  };
  const wallet = {
    address: account,
    sendTransaction: async (request) => {
      sent.push({ replacement: true, ...request });
      return { hash: `0x${'bb'.repeat(32)}` };
    },
    ...overrides.wallet,
  };
  const queue = new RelayerTransactionQueue({
    store: overrides.store || new MemoryRelayerJobStore(),
    maxGasLimit: overrides.maxGasLimit || 300000n,
    lowBalanceWei: overrides.lowBalanceWei || 1n,
    retryBaseMs: 0,
    receiptTimeoutMs: 2,
    sleep: async () => {},
    ...overrides.queue,
  });
  return { queue, provider, wallet, sent, setNonce: (value) => { nonce = value; } };
}

test('relayer queue is idempotent per operation and proofId and supplies managed nonce/gas', async () => {
  const f = fixture();
  let sendCount = 0;
  const submit = () => f.queue.submit({
    proofId, operation: 'anchor', wallet: f.wallet, provider: f.provider,
    estimateGas: async () => 100000n,
    send: async (overrides) => { sendCount += 1; return { hash: `0x${'aa'.repeat(32)}`, overrides }; },
  });
  const [first, duplicate] = await Promise.all([submit(), submit()]);
  assert.equal(sendCount, 1);
  assert.equal(first, duplicate);
  assert.equal(first.tx.overrides.nonce, 4);
  assert.equal(first.tx.overrides.gasLimit, 120000n);
  assert.equal(first.receipt.status, 1);
});

test('relayer queue serializes submissions per wallet and retries transient send errors with backoff', async () => {
  const f = fixture();
  let active = 0; let maxActive = 0; let tries = 0; let sleeps = 0;
  const queue = new RelayerTransactionQueue({
    store: new MemoryRelayerJobStore(), maxGasLimit: 300000n, lowBalanceWei: 1n,
    maxRetries: 2, receiptTimeoutMs: 2, sleep: async () => { sleeps += 1; },
  });
  const make = (id, shouldFail) => queue.submit({
    proofId: `0x${id.repeat(64)}`, operation: 'anchor', wallet: f.wallet, provider: f.provider,
    estimateGas: async () => 100000n,
    send: async (overrides) => {
      active += 1; maxActive = Math.max(maxActive, active); tries += 1;
      await Promise.resolve(); active -= 1;
      if (shouldFail && tries === 1) { const error = new Error('network'); error.code = 'NETWORK_ERROR'; throw error; }
      return { hash: `0x${id.repeat(64)}`, overrides };
    },
  });
  await Promise.all([make('2', true), make('3', false)]);
  assert.equal(maxActive, 1);
  assert.equal(sleeps, 1);
});

test('relayer queue rejects estimates above its hard gas cap before sending', async () => {
  const store = new MemoryRelayerJobStore();
  const f = fixture({ store }); let sent = false;
  await assert.rejects(f.queue.submit({
    proofId, operation: 'anchor', wallet: f.wallet, provider: f.provider,
    estimateGas: async () => 300001n, send: async () => { sent = true; return { hash: '0x1' }; },
  }), (error) => error.code === 'RELAYER_GAS_LIMIT_EXCEEDED');
  assert.equal(sent, false);
  assert.equal(store.records.get(`anchor:${proofId}`).state, 'failed');
});

test('relayer queue detects a stuck transaction and submits a same-nonce fee replacement', async () => {
  let waits = 0;
  const f = fixture({
    provider: {
      waitForTransaction: async (hash) => ++waits === 1 ? null : { status: 1, transactionHash: hash },
      getTransaction: async () => ({ to: account, data: '0x1234', value: 0n, gasLimit: 100000n, nonce: 4, chainId: 421614n, maxFeePerGas: 100n, maxPriorityFeePerGas: 10n, accessList: [] }),
    },
  });
  const result = await f.queue.submit({
    proofId, operation: 'anchor', wallet: f.wallet, provider: f.provider,
    estimateGas: async () => 100000n, send: async () => ({ hash: `0x${'aa'.repeat(32)}` }),
  });
  assert.equal(result.tx.hash, `0x${'bb'.repeat(32)}`);
  assert.equal(f.sent[0].nonce, 4);
  assert.equal(f.sent[0].maxFeePerGas, 113n);
});

test('relayer durable idempotency recovers a confirmed receipt after queue restart', async () => {
  const store = new MemoryRelayerJobStore();
  const f = fixture({ store });
  const first = await f.queue.submit({
    proofId, operation: 'anchor', wallet: f.wallet, provider: f.provider,
    estimateGas: async () => 100000n, send: async () => ({ hash: `0x${'cc'.repeat(32)}` }),
  });
  const nextProvider = { ...f.provider, getTransactionReceipt: async () => first.receipt };
  const restarted = new RelayerTransactionQueue({ store, lowBalanceWei: 1n, sleep: async () => {} });
  let sent = false;
  const recovered = await restarted.submit({
    proofId, operation: 'anchor', wallet: f.wallet, provider: nextProvider,
    estimateGas: async () => 100000n, send: async () => { sent = true; throw new Error('must not send'); },
  });
  assert.equal(recovered.tx.hash, first.tx.hash);
  assert.equal(sent, false);
});

test('ambiguous send outcome stays locked for reconciliation and never advances to another nonce', async () => {
  const store = new MemoryRelayerJobStore();
  const f = fixture({ store });
  let sendCalls = 0;
  const input = {
    proofId, operation: 'anchor', wallet: f.wallet, provider: f.provider,
    estimateGas: async () => 100000n,
    send: async () => { sendCalls += 1; const error = new Error('network'); error.code = 'NETWORK_ERROR'; throw error; },
  };
  await assert.rejects(f.queue.submit(input), (error) => error.code === 'RELAYER_SEND_FAILED');
  assert.equal(store.records.get(`anchor:${proofId}`).state, 'submitting');
  const restarted = new RelayerTransactionQueue({ store, lowBalanceWei: 1n, sleep: async () => {} });
  await assert.rejects(restarted.submit(input), (error) => error.code === 'RELAYER_JOB_RECONCILIATION_REQUIRED');
  assert.equal(sendCalls, 3);
});

test('Redis wallet lock serializes concurrent nonce users and releases after completion', async () => {
  const locks = new Map();
  const fakeRedis = {
    async set(key, owner) { if (locks.has(key)) return null; locks.set(key, owner); return 'OK'; },
    async get(key) { return locks.get(key) || null; },
    async eval(script, _count, key, owner) {
      if (locks.get(key) !== owner) return 0;
      if (script.includes('PEXPIRE')) return 1;
      locks.delete(key); return 1;
    },
    async ping() { return 'PONG'; },
  };
  const lock = new RedisWalletLock({ url: 'redis://unit.test', leaseMs: 3000, acquireTimeoutMs: 1000,
    redisFactory: async () => fakeRedis, sleep: async () => new Promise((resolve) => setTimeout(resolve, 1)) });
  let active = 0; let maxActive = 0; let releaseFirst; let firstStarted;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const first = lock.run(account, async () => {
    active += 1; maxActive = Math.max(maxActive, active); firstStarted();
    await new Promise((resolve) => { releaseFirst = resolve; }); active -= 1;
  });
  await started;
  const second = lock.run(account, async () => { active += 1; maxActive = Math.max(maxActive, active); active -= 1; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(maxActive, 1);
  assert.equal(locks.size, 0);
});
