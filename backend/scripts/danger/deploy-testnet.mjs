/**
 * Rollback: contracts are immutable; disable writes and record the address as retired.
 * Recovery requires an explicitly reviewed replacement deployment and config cutover.
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonRpcProvider, Wallet, Contract, ContractFactory } from 'ethers';
import { guardDangerScript } from './guard.mjs';

const mainnetInvocation = path.basename(process.argv[1] || '') === 'deploy-arbitrum-one.mjs';
if (!mainnetInvocation && process.env.PANDU_CHAIN === 'arbitrum-one') {
  console.error('Refusing mainnet target from deploy-testnet; use the guarded mainnet entry point.');
  process.exit(2);
}
if (!await guardDangerScript({ scriptName: mainnetInvocation ? 'deploy-arbitrum-one' : 'deploy-testnet', kind: mainnetInvocation ? 'mainnet' : 'chain' })) process.exit(process.exitCode || 0);

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rootDir = path.resolve(backendDir, '..');
const artifactPath = path.join(rootDir, 'smart-contract', 'out', 'PANDUQualityRegistry.sol', 'PANDUQualityRegistry.json');
const envPath = path.join(backendDir, '.env');
const chainName = process.env.PANDU_CHAIN || 'arbitrum-sepolia';
const chainId = chainName === 'arbitrum-one' ? 42161 : 421614;
const chainLabel = chainName === 'arbitrum-one' ? 'Arbitrum One' : 'Arbitrum Sepolia';
const explorer = chainName === 'arbitrum-one' ? 'https://arbiscan.io' : 'https://sepolia.arbiscan.io';
const rpcUrl = chainName === 'arbitrum-one' ? (process.env.ARBITRUM_ONE_RPC_URL || 'https://arb1.arbitrum.io/rpc') : (process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc');
if (!['arbitrum-sepolia', 'arbitrum-one'].includes(chainName)) throw new Error('PANDU_CHAIN harus arbitrum-sepolia atau arbitrum-one.');
if (chainName === 'arbitrum-one' && !process.env.DEPLOYER_PRIVATE_KEY) throw new Error('Mainnet deploy memerlukan DEPLOYER_PRIVATE_KEY terpisah dari wallet relayer.');
if (!process.env.RELAYER_PRIVATE_KEY) throw new Error('RELAYER_PRIVATE_KEY tidak ada di backend/.env.');
if (!process.env.PANDU_REGISTRY_ADDRESS) {
  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(chainId)) throw new Error(`RPC bukan ${chainLabel} (chain ${network.chainId}).`);
  const relayer = new Wallet(process.env.RELAYER_PRIVATE_KEY);
  const deployer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || process.env.RELAYER_PRIVATE_KEY, provider);
  const balance = await provider.getBalance(deployer.address);
  console.log(`Wallet deployer/admin: ${deployer.address}`);
  console.log(`Wallet relayer: ${relayer.address}`);
  console.log(`Saldo deployer: ${balance} wei`);
  if (balance === 0n) throw new Error('Saldo kosong. Klaim Arbitrum Sepolia ETH di faucet, lalu jalankan deploy kembali.');
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
  const factory = new ContractFactory(artifact.abi, artifact.bytecode.object, deployer);
  const contract = await factory.deploy(relayer.address);
  const tx = contract.deploymentTransaction();
  console.log(`Transaksi deploy: ${tx.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const networkId = Number(network.chainId);
  const manifest = { contractName: 'PANDUQualityRegistry', address, network: chainLabel, chainId: networkId, deployer: deployer.address, admin: deployer.address, relayer: relayer.address, deploymentTx: tx.hash, deploymentBlock: await provider.getBlockNumber(), rpcUrl, deployedAt: new Date().toISOString(), abi: artifact.abi };
  await writeFile(path.join(rootDir, 'smart-contract', 'deployment.json'), JSON.stringify(manifest, null, 2));
  const existing = await readFile(envPath, 'utf8');
  const updated = /^PANDU_REGISTRY_ADDRESS=.*$/m.test(existing) ? existing.replace(/^PANDU_REGISTRY_ADDRESS=.*$/m, `PANDU_REGISTRY_ADDRESS=${address}`) : `${existing.trimEnd()}\nPANDU_REGISTRY_ADDRESS=${address}\n`;
  await writeFile(envPath, updated);
  process.env.PANDU_REGISTRY_ADDRESS = address;
  console.log(`Kontrak deployed: ${address}`);
  console.log(`Explorer: ${explorer}/address/${address}`);
} else {
  console.log(`PANDU_REGISTRY_ADDRESS sudah terisi (${process.env.PANDU_REGISTRY_ADDRESS}). Deployment dilewati.`);
}

const verifyWallet = new Wallet(process.env.RELAYER_PRIVATE_KEY);
const readContract = new Contract(process.env.PANDU_REGISTRY_ADDRESS, [
  'function RELAYER_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function getProof(bytes32) view returns ((bytes32,bytes32,bytes32,address,uint64,bool,address,uint64))'
], new JsonRpcProvider(rpcUrl, chainId));
const role = await readContract.RELAYER_ROLE();
if (!(await readContract.hasRole(role, verifyWallet.address))) throw new Error('Wallet relayer belum memiliki RELAYER_ROLE pada kontrak yang dikonfigurasi.');
console.log(`Verifikasi relayer OK: ${verifyWallet.address}`);
const adminRole = await readContract.DEFAULT_ADMIN_ROLE();
if (await readContract.hasRole(adminRole, verifyWallet.address)) console.warn('Catatan: wallet admin dan relayer sama. Untuk deployment selain demo, gunakan DEPLOYER_PRIVATE_KEY terpisah.');
