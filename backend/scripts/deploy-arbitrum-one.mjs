import 'dotenv/config';

if (process.env.MAINNET_DEPLOY_CONFIRMATION !== 'I UNDERSTAND THIS USES REAL ETH') {
  throw new Error('Mainnet deploy dihentikan: MAINNET_DEPLOY_CONFIRMATION harus bernilai "I UNDERSTAND THIS USES REAL ETH" setelah audit dan persetujuan pemilik.');
}
process.env.PANDU_CHAIN = 'arbitrum-one';
process.env.ENABLE_MAINNET_DEPLOYMENT = 'true';
await import('./deploy-testnet.mjs');
