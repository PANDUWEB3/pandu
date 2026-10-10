import { JsonRpcProvider } from 'ethers';

export function chainIdForName(name) {
  if (name === 'arbitrum-one') return 42161;
  if (name === 'arbitrum-sepolia') return 421614;
  throw new Error('Unsupported PANDU_CHAIN.');
}

export function createProviderForChain(chainId, env = process.env) {
  const numericId = Number(chainId);
  if (numericId === 421614) return new JsonRpcProvider(env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc', numericId);
  if (numericId === 42161) return new JsonRpcProvider(env.ARBITRUM_ONE_RPC_URL || 'https://arb1.arbitrum.io/rpc', numericId);
  throw new Error(`Unsupported chain ID ${numericId}.`);
}

export function createConfiguredProvider(chainName, env = process.env) {
  return createProviderForChain(chainIdForName(chainName), env);
}
