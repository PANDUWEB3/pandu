import express from 'express';

export function createHealthRouter({ getProvider, expectedChainId, chainLabel, supabaseConfigured, registryConfigured, checkRelayerStore }) {
  const router = express.Router();
  router.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
  router.get('/readyz', async (_req, res) => {
    try {
      const network = await getProvider().getNetwork();
      const chainReady = network.chainId === BigInt(expectedChainId);
      const relayerReady = checkRelayerStore ? await checkRelayerStore() : true;
      const ready = chainReady && supabaseConfigured && registryConfigured && relayerReady;
      return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
    } catch {
      return res.status(503).json({ status: 'not_ready' });
    }
  });
  router.get('/api/health', async (_req, res) => {
    try {
      const provider = getProvider();
      const [network, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
      return res.json({
        ok: true, chainId: Number(network.chainId), expectedChainId: expectedChainId,
        chainLabel, blockNumber, configured: registryConfigured, supabaseConfigured,
      });
    } catch {
      return res.status(503).json({ ok: false, error: 'CHAIN_UNAVAILABLE' });
    }
  });
  return router;
}
