import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createHealthRouter } from '../src/routes/health.js';

test('healthz is live and readyz checks chain, database, registry, and relayer journal', async (context) => {
  const app = express();
  let relayerStoreReady = false;
  app.use(createHealthRouter({
    getProvider: () => ({ getNetwork: async () => ({ chainId: 421614n }), getBlockNumber: async () => 100 }),
    expectedChainId: 421614, chainLabel: 'Arbitrum Sepolia', supabaseConfigured: true, registryConfigured: true,
    checkRelayerStore: async () => relayerStoreReady,
  }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;

  assert.deepEqual(await (await fetch(`${base}/healthz`)).json(), { status: 'ok' });
  assert.equal((await fetch(`${base}/readyz`)).status, 503);
  relayerStoreReady = true;
  assert.equal((await fetch(`${base}/readyz`)).status, 200);
});

