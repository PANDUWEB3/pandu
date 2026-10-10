import { existsSync } from 'node:fs';
import { chmod, writeFile } from 'node:fs/promises';
import { Wallet } from 'ethers';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) {
  console.error('backend/.env sudah ada. Script tidak menimpa wallet atau kredensial yang ada.');
  process.exit(1);
}
const wallet = Wallet.createRandom();
const contents = [
  'PORT=8787',
  'FRONTEND_ORIGIN=http://localhost:5173',
  'ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc',
  `RELAYER_PRIVATE_KEY=${wallet.privateKey}`,
  'PANDU_REGISTRY_ADDRESS=',
  'DATA_FILE=./data/demo-state.json',
  'UPLOAD_DIR=./data/uploads',
  ''
].join('\n');
await writeFile(envPath, contents, { flag: 'wx', mode: 0o600 });
if (process.platform === 'win32') {
  const { execFileSync } = await import('node:child_process');
  const username = process.env.USERNAME;
  if (username) {
    try { execFileSync('icacls', [envPath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], { stdio: 'ignore' }); }
    catch { console.warn('Tidak dapat memperketat ACL backend/.env; cek izin file secara manual.'); }
  }
} else {
  await chmod(envPath, 0o600);
}
console.log(`Wallet testnet lokal dibuat. Alamat publik: ${wallet.address}`);
console.log(`File secret: ${path.relative(process.cwd(), envPath)} (jangan dibagikan atau di-commit).`);
console.log('Langkah berikutnya: klaim sedikit Arbitrum Sepolia ETH untuk alamat di atas.');
