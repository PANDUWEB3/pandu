/**
 * Rollback: mainnet deployments are immutable. Emergency response is to halt operational
 * writes, preserve the address as retired, and follow an approved replacement/migration plan.
 */
import 'dotenv/config';

process.env.PANDU_CHAIN = 'arbitrum-one';
await import('./deploy-testnet.mjs');
