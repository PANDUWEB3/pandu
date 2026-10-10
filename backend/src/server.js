import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Contract, Interface, JsonRpcProvider, Wallet, getAddress, id, keccak256, toUtf8Bytes, verifyMessage
} from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { assertProductionEnv, parseTrustProxy } from './env-guard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Wajib di produksi: TRUST_PROXY + REDIS_URL (lihat PANDU_Deployment_Runbook_v1.0.md)
assertProductionEnv(process.env);
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
const port = Number(process.env.PORT || 8787);
const dataFile = path.resolve(__dirname, '..', process.env.DATA_FILE || './data/demo-state.json');
const uploadDir = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || './data/uploads');
const chainName = process.env.PANDU_CHAIN || 'arbitrum-sepolia';
const chainId = chainName === 'arbitrum-one' ? 42161n : 421614n;
const chainLabel = chainName === 'arbitrum-one' ? 'Arbitrum One' : 'Arbitrum Sepolia';
const explorerBase = chainName === 'arbitrum-one' ? 'https://arbiscan.io' : 'https://sepolia.arbiscan.io';
const rpcUrl = chainName === 'arbitrum-one' ? (process.env.ARBITRUM_ONE_RPC_URL || 'https://arb1.arbitrum.io/rpc') : (process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc');
if (!['arbitrum-sepolia', 'arbitrum-one'].includes(chainName)) throw new Error('PANDU_CHAIN harus arbitrum-sepolia atau arbitrum-one.');
const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const allowedOrigins = new Set([origin, 'http://localhost:5173', 'http://127.0.0.1:5173']);
const supabaseUrl = process.env.SUPABASE_URL;
// Prefer Supabase's current server-only secret key; keep legacy service_role
// support for local environments that have not migrated yet.
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

// ABI v2 – PANDUQualityRegistry v2 (TIDAK kompatibel dengan v1)
const abi = [
  // Errors
  'error ProofNotFound(bytes32 proofId)',
  'error ProofAlreadyExists(bytes32 proofId)',
  'error NotIssuer(address attester)',
  'error SignatureExpired(uint256 deadline)',
  'error InvalidSignature()',
  'error NotAuthorizedToRevoke(address caller)',
  'error ProofAlreadyRevoked(bytes32 proofId)',
  'error ZeroAddress()',
  'error ZeroValue()',
  'error AccessControlUnauthorizedAccount(address account,bytes32 neededRole)',
  'error EnforcedPause()',
  'error ExpectedPause()',
  // Role selectors
  'function RELAYER_ROLE() view returns (bytes32)',
  'function ISSUER_ROLE() view returns (bytes32)',
  'function PAUSER_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  'function ANCHOR_TYPEHASH() view returns (bytes32)',
  'function REVOKE_TYPEHASH() view returns (bytes32)',
  'function hasRole(bytes32,address) view returns (bool)',
  'function paused() view returns (bool)',
  // Anchor – 6 argumen, hanya RELAYER_ROLE, memerlukan tanda tangan EIP-712 dari attester
  'function anchorProof(bytes32 proofId,bytes32 batchRef,bytes32 evidenceHash,address attester,uint256 deadline,bytes signature)',
  // Revoke langsung oleh penerbit asli atau admin
  'function revokeProof(bytes32 proofId,bytes32 reasonHash)',
  // Revoke via relayer dengan tanda tangan penerbit
  'function revokeProofWithSig(bytes32 proofId,bytes32 reasonHash,uint256 deadline,bytes signature)',
  // Views – struct Proof v2 memiliki kolom relayer dan revokeReason baru
  'function getProof(bytes32 proofId) view returns ((bytes32 proofId,bytes32 batchRef,bytes32 evidenceHash,address attester,address relayer,uint64 timestamp,bool revoked,address revoker,uint64 revokedAt,bytes32 revokeReason))',
  'function isValid(bytes32 proofId) view returns (bool)',
  'function verify(bytes32 proofId,bytes32 evidenceHash) view returns (bool)',
  // Pause
  'function pause()',
  'function unpause()',
  // Events v2 – ProofAnchored tambah relayer; ProofRevoked tambah reasonHash
  'event ProofAnchored(bytes32 indexed proofId,bytes32 indexed batchRef,bytes32 evidenceHash,address indexed attester,address relayer,uint64 timestamp)',
  'event ProofRevoked(bytes32 indexed proofId,address indexed revoker,bytes32 reasonHash,uint64 timestamp)',
];
const registryInterface = new Interface(abi);
const legacyRegistryAddress = process.env.PANDU_LEGACY_REGISTRY_ADDRESS
  ? getAddress(process.env.PANDU_LEGACY_REGISTRY_ADDRESS)
  : null;
const legacyRegistryAbi = [
  'function getProof(bytes32 proofId) view returns ((bytes32 proofId,bytes32 batchRef,bytes32 evidenceHash,address attester,uint64 timestamp,bool revoked,address revoker,uint64 revokedAt))',
];

// Zod schemas untuk validasi ketat input
const AnchorBodySchema = z.object({
  signature: z.string().min(10, 'Signature tidak valid'),
  attester: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Alamat attester harus format hex 20 byte'),
  deadline: z.union([z.number(), z.string(), z.bigint()]),
});

const RevokeBodySchema = z.object({
  reasonHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'reasonHash harus format bytes32 hex'),
  signature: z.string().min(10).optional(),
  deadline: z.union([z.number(), z.string(), z.bigint()]).optional(),
});

const CreateProofBodySchema = z.object({
  inspectionId: z.string().uuid('ID inspeksi harus berupa UUID valid'),
  evidence: z.array(z.object({
    cid: z.string().min(1),
    sha256: z.string().optional(),
    hmac: z.string().optional(),
    salt: z.string().optional(),
  })).optional(),
});

const InviteMemberBodySchema = z.object({
  email: z.string().email('Format email tidak valid'),
  role: z.enum(['admin', 'qc', 'qa', 'auditor']),
});

const SubmitInspectionBodySchema = z.object({
  actual: z.number({ invalid_type_error: 'Masukkan angka hasil pengukuran.' }),
  notes: z.string().max(500, 'Catatan maksimal 500 karakter').optional(),
});


app.use(cors({ origin: (requestOrigin, callback) => callback(null, !requestOrigin || allowedOrigins.has(requestOrigin)), credentials: false }));
app.use(express.json({ limit: '1mb' }));
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => { try { await mkdir(uploadDir, { recursive: true }); cb(null, uploadDir); } catch (e) { cb(e); } },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).slice(0, 12)}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
    cb(allowed.has(file.mimetype) ? null : new Error('File harus berupa PDF, JPG, PNG, atau WebP.'), allowed.has(file.mimetype));
  }
});

const seed = () => ({
  organization: 'PT PANDU Nusantara',
  proofCounter: 0,
  batch: { id: 'ST-2026-001', material: 'Pelat baja SS400', supplier: 'PT Baja Nusantara', origin: 'Jakarta' },
  inspection: { status: 'DRAFT', actual: 10, min: 9.5, max: 10.5, unit: 'mm', submittedAt: null, approvedAt: null, notes: '' },
  evidence: [],
  proof: null,
  anchor: { status: 'NOT_ANCHORED', transactionHash: null, blockNumber: null, error: null },
  // Proof snapshots are retained so links keep working after a new inspection or local reset.
  proofArchive: [],
  audit: [{ action: 'DEMO_READY', actor: 'PANDU', at: new Date().toISOString() }]
});

let state;
let writeQueue = Promise.resolve();
async function loadState() {
  try { state = JSON.parse(await readFile(dataFile, 'utf8')); }
  catch { state = seed(); await persist(); }
  state.proofArchive ||= [];
  // Migrate the previous single-proof demo state without invalidating its public link.
  if (state.proof && !state.proofArchive.some((entry) => entry.id === state.proof.id)) {
    const snapshot = buildPublicProof();
    state.proofArchive.push({ id: state.proof.id, snapshot, commitment: state.proof.commitment, batchRef: batchRefBytes(snapshot.batchRef), createdAt: state.proof.createdAt, anchor: { ...state.anchor } });
    await persist();
  }
}
function persist() {
  writeQueue = writeQueue.then(async () => {
    await mkdir(path.dirname(dataFile), { recursive: true });
    const temporary = `${dataFile}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2));
    const { rename } = await import('node:fs/promises');
    await rename(temporary, dataFile);
  });
  return writeQueue;
}
function audit(action, actor = 'DEMO USER') { state.audit.unshift({ action, actor, at: new Date().toISOString() }); }
function getProvider() { return new JsonRpcProvider(rpcUrl, Number(chainId)); }
function getProviderForChain(idValue) {
  const id = Number(idValue);
  if (id === 421614) return new JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc', id);
  if (id === 42161) return new JsonRpcProvider(process.env.ARBITRUM_ONE_RPC_URL || 'https://arb1.arbitrum.io/rpc', id);
  throw new Error(`Chain ID ${id} tidak didukung.`);
}
function chainLabelFor(idValue) { return Number(idValue) === 42161 ? 'Arbitrum One' : 'Arbitrum Sepolia'; }
function explorerFor(idValue) { return Number(idValue) === 42161 ? 'https://arbiscan.io' : 'https://sepolia.arbiscan.io'; }
function getRegistry(signerOrProvider) {
  if (!process.env.PANDU_REGISTRY_ADDRESS) throw new Error('Kontrak belum dikonfigurasi. Deploy kontrak lalu isi PANDU_REGISTRY_ADDRESS.');
  return new Contract(getAddress(process.env.PANDU_REGISTRY_ADDRESS), abi, signerOrProvider);
}
function proofIdBytes(idString) { return keccak256(toUtf8Bytes(`PANDU:${idString}`)); }
function batchRefBytes(idString) { return keccak256(toUtf8Bytes(`PANDU:${state.organization}:${idString}`)); }

// ---------------------------------------------------------------------------
// EIP-712 Typed Data – identik dengan kontrak PANDUQualityRegistry v2
// ---------------------------------------------------------------------------

/** Kembalikan typed data EIP-712 untuk anchorProof (Anchor typehash). */
function buildAnchorTypedData({ chainId: cId, contractAddress, proofId: pid, batchRef: bref, evidenceHash: eh, attester, deadline }) {
  return {
    domain: { name: 'PANDUQualityRegistry', version: '2', chainId: Number(cId), verifyingContract: contractAddress },
    types: {
      Anchor: [
        { name: 'proofId', type: 'bytes32' },
        { name: 'batchRef', type: 'bytes32' },
        { name: 'evidenceHash', type: 'bytes32' },
        { name: 'attester', type: 'address' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Anchor',
    message: { proofId: pid, batchRef: bref, evidenceHash: eh, attester, deadline: BigInt(deadline) },
  };
}

/** Kembalikan typed data EIP-712 untuk revokeProofWithSig (Revoke typehash). */
function buildRevokeTypedData({ chainId: cId, contractAddress, proofId: pid, reasonHash, deadline }) {
  return {
    domain: { name: 'PANDUQualityRegistry', version: '2', chainId: Number(cId), verifyingContract: contractAddress },
    types: {
      Revoke: [
        { name: 'proofId', type: 'bytes32' },
        { name: 'reasonHash', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Revoke',
    message: { proofId: pid, reasonHash, deadline: BigInt(deadline) },
  };
}

/**
 * Petakan custom error kontrak v2 ke pesan ramah UI.
 * Kembalikan string atau null jika tidak dikenal.
 */
function mapContractError(error) {
  let errName = error?.revert?.name || '';
  if (!errName) {
    try {
      const data = error?.data || error?.info?.error?.data || error?.error?.data;
      if (data && typeof data === 'string' && data.startsWith('0x')) {
        const parsed = registryInterface.parseError(data);
        if (parsed) errName = parsed.name;
      }
    } catch (_) {}
  }
  const msg = `${errName} ${error?.shortMessage || ''} ${error?.message || ''}`;
  if (msg.includes('NotIssuer')) return 'Attester tidak memiliki ISSUER_ROLE. Minta admin grant ISSUER_ROLE terlebih dahulu.';
  if (msg.includes('SignatureExpired')) return 'Tanda tangan penerbit sudah kedaluwarsa. Minta tanda tangan baru.';
  if (msg.includes('InvalidSignature')) return 'Tanda tangan tidak valid. Pastikan penerbit menandatangani typed data EIP-712 v2 yang benar.';
  if (msg.includes('ProofAlreadyExists')) return 'Proof dengan ID ini sudah ada di jaringan. Gunakan ID berbeda.';
  if (msg.includes('ProofAlreadyRevoked')) return 'Proof sudah dicabut dan tidak dapat dicabut lagi.';
  if (msg.includes('ProofNotFound')) return 'Proof tidak ditemukan. Pastikan sudah di-anchor.';
  if (msg.includes('NotAuthorizedToRevoke')) return 'Hanya penerbit asli atau admin yang bisa mencabut proof ini.';
  if (msg.includes('ZeroValue')) return 'Salah satu hash (proofId/batchRef/evidenceHash) bernilai nol. Periksa canonical proof.';
  if (msg.includes('ZeroAddress')) return 'Alamat attester tidak boleh nol.';
  if (msg.includes('EnforcedPause')) return 'Kontrak sedang dijeda. Hubungi operator PANDU.';
  if (msg.includes('RELAYER_ROLE') || msg.includes('AccessControlUnauthorizedAccount')) return 'Wallet relayer belum punya role yang diperlukan pada kontrak v2. Jalankan GrantRoles.s.sol.';
  return null;
}

/** Kirim transaksi dengan retry eksponen (maks 3x, untuk RPC timeout / underpriced gas). */
async function sendWithRetry(txFn, label = 'transaksi', maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await txFn(); }
    catch (err) {
      lastError = err;
      // Jangan retry untuk contract revert atau user rejection
      if (err?.code === 'CALL_EXCEPTION' || err?.code === 'ACTION_REJECTED') throw err;
      if (attempt < maxRetries) {
        const delay = 1000 * 2 ** (attempt - 1);
        console.warn(`[${label}] Percobaan ${attempt}/${maxRetries} gagal, retry dalam ${delay}ms:`, err?.shortMessage || err?.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// Rate Limiter: In-Memory dengan TTL Cleanup + Adapter Redis opsional via REDIS_URL
function getClientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';
}

import { RateLimiter, REDIS_LUA_RATELIMIT } from './rate-limiter.js';

const rateLimiter = new RateLimiter();
async function checkRateLimit(key, limitPerMinute = 10) {
  return await rateLimiter.check(key, limitPerMinute, 60_000);
}

function buildPublicProof(source = state) {
  if (!source.proof) throw new Error('Buat bukti PANDU terlebih dahulu.');
  // Property order is the canonicalization v1 schema. Keep this in sync with PANDU docs.
  return {
    canonicalizationVersion: 1,
    proofId: source.proof.id,
    batchRef: source.batch.id,
    material: source.batch.material,
    supplier: source.batch.supplier,
    inspection: {
      type: 'Ketebalan', actual: Number(source.inspection.actual).toFixed(1), min: Number(source.inspection.min).toFixed(1), max: Number(source.inspection.max).toFixed(1), unit: source.inspection.unit, result: 'PASS'
    },
    evidenceHashes: [...source.evidence.map((item) => item.sha256)].sort(),
    approvedAt: source.inspection.approvedAt
  };
}
function commitment(snapshot = buildPublicProof()) { return `0x${createHash('sha256').update(Buffer.from(JSON.stringify(snapshot), 'utf8')).digest('hex')}`; }
function summarize() {
  return { ...state, proofArchive: undefined, evidence: state.evidence.map(({ storagePath: _storagePath, ...item }) => ({ ...item, downloadUrl: `/api/evidence/${encodeURIComponent(item.id)}` })), proofHistory: (state.proofArchive || []).map(({ id, commitment: digest, anchor: savedAnchor, snapshot, createdAt }) => ({ id, commitment: digest, anchor: savedAnchor, createdAt: createdAt || snapshot.approvedAt, batchRef: snapshot.batchRef })), publicProof: state.proof ? buildPublicProof() : null, configured: Boolean(process.env.RELAYER_PRIVATE_KEY && process.env.PANDU_REGISTRY_ADDRESS) };
}

app.get('/api/health', async (_req, res) => {
  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    res.json({ ok: true, chainId: Number(network.chainId), expectedChainId: Number(chainId), chainLabel, explorerBase, blockNumber, contractAddress: process.env.PANDU_REGISTRY_ADDRESS || null, configured: Boolean(process.env.RELAYER_PRIVATE_KEY && process.env.PANDU_REGISTRY_ADDRESS), writesEnabled: chainName !== 'arbitrum-one' || process.env.ENABLE_MAINNET_ANCHOR === 'true', supabaseConfigured: Boolean(supabaseAdmin) });
  } catch (error) { res.status(503).json({ ok: false, error: error.message }); }
});

async function requireSupabaseUser(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Sesi login diperlukan.' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Sesi login tidak valid atau kedaluwarsa.' });
  req.authUser = data.user;
  next();
}

app.post('/api/wallet/link/challenge', requireSupabaseUser, async (req, res) => {
  try {
    const address = getAddress(String(req.body.address || ''));
    const networkId = Number(req.body.chainId);
    if (![421614, 42161].includes(networkId)) return res.status(400).json({ error: 'Hubungkan wallet ke Arbitrum Sepolia atau Arbitrum One.' });
    const domain = new URL(origin).host;
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const issuedAt = new Date().toISOString();
    const message = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nConnect this wallet to your PANDU account. This is a gas-free message, not a transaction.\n\nURI: ${new URL(origin).origin}\nVersion: 1\nChain ID: ${networkId}\nNonce: ${nonce}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}`;
    const { data, error } = await supabaseAdmin.from('wallet_link_challenges').insert({
      user_id: req.authUser.id,
      nonce_hash: `\\x${createHash('sha256').update(nonce).digest('hex')}`,
      domain,
      chain_id: networkId,
      expires_at: expiresAt,
    }).select('id').single();
    if (error) throw error;
    res.json({ challengeId: data.id, message, expiresAt });
  } catch (error) { res.status(400).json({ error: error.message || 'Gagal membuat permintaan taut wallet.' }); }
});

app.post('/api/wallet/link/verify', requireSupabaseUser, async (req, res) => {
  const { challengeId, message, signature } = req.body || {};
  if (!challengeId || typeof message !== 'string' || typeof signature !== 'string') return res.status(400).json({ error: 'Data tanda tangan wallet belum lengkap.' });
  try {
    const { data: challenge, error } = await supabaseAdmin.from('wallet_link_challenges').select('*').eq('id', challengeId).eq('user_id', req.authUser.id).maybeSingle();
    if (error) throw error;
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) <= new Date()) return res.status(400).json({ error: 'Permintaan wallet kedaluwarsa atau sudah digunakan. Coba lagi.' });
    const address = getAddress(message.match(/account:\n(0x[0-9a-fA-F]{40})/)?.[1] || '');
    const fields = Object.fromEntries([...message.matchAll(/^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time): (.+)$/gm)].map((match) => [match[1], match[2]]));
    const issuedAt = Date.parse(fields['Issued At']);
    if (!message.startsWith(`${challenge.domain} wants you to sign in with your Ethereum account:\n${address}\n`)
      || !message.includes('Connect this wallet to your PANDU account. This is a gas-free message, not a transaction.')
      || fields['URI'] !== new URL(origin).origin || fields['Version'] !== '1'
      || fields['Chain ID'] !== String(challenge.chain_id) || new Date(fields['Expiration Time']).getTime() !== new Date(challenge.expires_at).getTime()
      || !Number.isFinite(issuedAt) || Math.abs(issuedAt - new Date(challenge.created_at).getTime()) > 120_000
      || !fields['Nonce'] || createHash('sha256').update(fields['Nonce']).digest('hex') !== String(challenge.nonce_hash).replace(/^\\x/, '')) {
      return res.status(400).json({ error: 'Pesan wallet tidak cocok dengan permintaan PANDU.' });
    }
    const signer = getAddress(verifyMessage(message, signature));
    if (signer !== address) return res.status(400).json({ error: 'Tanda tangan tidak cocok dengan alamat wallet.' });
    const { data: consumed, error: consumeError } = await supabaseAdmin.from('wallet_link_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', challengeId).is('consumed_at', null).select('id').maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumed) return res.status(409).json({ error: 'Permintaan wallet sudah digunakan. Coba ulang.' });
    const { data: existingWallet, error: walletLookupError } = await supabaseAdmin.from('user_wallets').select('user_id').eq('chain_namespace', 'eip155').eq('address', address.toLowerCase()).maybeSingle();
    if (walletLookupError) throw walletLookupError;
    if (existingWallet && existingWallet.user_id !== req.authUser.id) return res.status(409).json({ error: 'Wallet sudah ditautkan ke akun PANDU lain.' });
    const { error: linkError } = existingWallet ? { error: null } : await supabaseAdmin.from('user_wallets').insert({ user_id: req.authUser.id, chain_namespace: 'eip155', chain_id: challenge.chain_id, address: address.toLowerCase(), verified_at: new Date().toISOString() });
    if (linkError) throw linkError;
    res.json({ address, chainId: challenge.chain_id, linked: true });
  } catch (error) { res.status(400).json({ error: error.message || 'Verifikasi tanda tangan gagal.' }); }
});

function hexBytes32(value) { return `\\x${String(value).replace(/^0x/, '')}`; }
export { canonicalJson, sha256Hex, computeCanonicalEvidenceHash } from './canonical.js';
import { canonicalJson, sha256Hex, computeCanonicalEvidenceHash } from './canonical.js';
export function bytes32Hex(value) { return typeof value === 'string' ? value.replace(/^\\x/, '').replace(/^0x/, '') : Buffer.from(value).toString('hex'); }
async function requireOrgRole(userId, orgId, roles) {
  const { data, error } = await supabaseAdmin.from('organization_members').select('role').eq('organization_id', orgId).eq('user_id', userId).eq('status', 'active').maybeSingle();
  if (error) throw error;
  if (!data || !roles.includes(data.role)) throw new Error('Akses ditolak: peran organisasi tidak memiliki izin untuk tindakan ini.');
  return data.role;
}

app.get('/api/organizations/:orgId/members', requireSupabaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    await requireOrgRole(req.authUser.id, orgId, ['owner', 'admin', 'qc', 'qa', 'auditor']);
    const { data: members, error } = await supabaseAdmin.from('organization_members')
      .select('organization_id,user_id,role,status,joined_at,invited_by')
      .eq('organization_id', orgId).order('joined_at');
    if (error) throw error;
    const users = await Promise.all((members || []).map(async (member) => {
      const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
      if (userError) return { ...member, email: null, name: null };
      return { ...member, email: data.user?.email || null, name: data.user?.user_metadata?.full_name || null };
    }));
    res.json({ members: users });
  } catch (error) { res.status(403).json({ error: error.message || 'Daftar anggota tidak dapat dibuka.' }); }
});

app.post('/api/organizations/:orgId/invitations', requireSupabaseUser, async (req, res) => {
  try {
    const { orgId } = req.params;
    const actorRole = await requireOrgRole(req.authUser.id, orgId, ['owner', 'admin']);
    const parsed = InviteMemberBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Input undangan tidak valid.' });
    const { email, role } = parsed.data;
    if (role === 'admin' && actorRole !== 'owner') return res.status(403).json({ error: 'Hanya owner yang dapat mengundang admin.' });
    let existingUser = null;
    for (let page = 1; page <= 20 && !existingUser; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      existingUser = data.users.find((user) => user.email?.toLowerCase() === email) || null;
      if (data.users.length < 1000) break;
    }
    if (existingUser) {
      const { data: current, error } = await supabaseAdmin.from('organization_members').select('status').eq('organization_id', orgId).eq('user_id', existingUser.id).maybeSingle();
      if (error) throw error;
      if (current) return res.status(409).json({ error: current.status === 'active' ? 'Email ini sudah menjadi anggota organisasi.' : 'Undangan untuk email ini masih menunggu diterima.' });
    }
    const invitation = existingUser ? { user: existingUser } : await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/workspace` });
    if (invitation.error) return res.status(409).json({ error: invitation.error.message || 'Undangan tidak dapat dikirim.' });
    const memberStatus = existingUser ? 'active' : 'invited';
    const { data: membership, error: membershipError } = await supabaseAdmin.from('organization_members').insert({ organization_id: orgId, user_id: invitation.data?.user?.id || invitation.user?.id, role, status: memberStatus, invited_by: req.authUser.id }).select('organization_id,user_id,role,status,joined_at,invited_by').single();
    if (membershipError) return res.status(502).json({ error: 'Email undangan terkirim, tetapi akses organisasi belum tersimpan. Hubungi admin sebelum mengirim undangan ulang.' });
    await supabaseAdmin.from('audit_events').insert({ organization_id: orgId, actor_id: req.authUser.id, action: existingUser ? 'organization.member_added' : 'organization.member_invited', entity_type: 'organization_member', entity_id: null, details: { email, role } });
    res.status(201).json({ member: { ...membership, email }, message: existingUser ? 'Akses anggota ditambahkan.' : 'Email undangan dikirim.' });
  } catch (error) { res.status(403).json({ error: error.message || 'Undangan tidak dapat dibuat.' }); }
});

app.patch('/api/organizations/:orgId/members/:userId', requireSupabaseUser, async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const actorRole = await requireOrgRole(req.authUser.id, orgId, ['owner', 'admin']);
    const role = String(req.body?.role || '').trim().toLowerCase();
    if (!['admin', 'qc', 'qa', 'auditor'].includes(role)) return res.status(400).json({ error: 'Pilih peran admin, QC, QA, atau auditor.' });
    if (role === 'admin' && actorRole !== 'owner') return res.status(403).json({ error: 'Hanya owner yang dapat menetapkan peran admin.' });
    const { data: current, error: currentError } = await supabaseAdmin.from('organization_members').select('role,status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.role === 'owner') return res.status(404).json({ error: 'Anggota tidak ditemukan atau merupakan owner organisasi.' });
    const { data: updated, error } = await supabaseAdmin.from('organization_members').update({ role }).eq('organization_id', orgId).eq('user_id', userId).select('organization_id,user_id,role,status,joined_at,invited_by').single();
    if (error) throw error;
    await supabaseAdmin.from('audit_events').insert({ organization_id: orgId, actor_id: req.authUser.id, action: 'organization.member_role_changed', entity_type: 'organization_member', details: { user_id: userId, old_role: current.role, new_role: role } });
    res.json({ member: updated });
  } catch (error) { res.status(403).json({ error: error.message || 'Peran anggota tidak dapat diubah.' }); }
});

app.delete('/api/organizations/:orgId/members/:userId', requireSupabaseUser, async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    await requireOrgRole(req.authUser.id, orgId, ['owner', 'admin']);
    if (userId === req.authUser.id) return res.status(409).json({ error: 'Anda tidak dapat mencabut akses akun yang sedang digunakan.' });
    const { data: member, error: lookupError } = await supabaseAdmin.from('organization_members').select('role,status').eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!member || member.role === 'owner') return res.status(404).json({ error: 'Anggota tidak ditemukan atau merupakan owner organisasi.' });
    const { error } = await supabaseAdmin.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId);
    if (error) throw error;
    await supabaseAdmin.from('audit_events').insert({ organization_id: orgId, actor_id: req.authUser.id, action: 'organization.member_access_revoked', entity_type: 'organization_member', details: { user_id: userId, role: member.role } });
    res.json({ ok: true });
  } catch (error) { res.status(403).json({ error: error.message || 'Akses anggota tidak dapat dicabut.' }); }
});
async function getBatchDetails(orgId, inspectionId) {
  const { data: inspection, error: inspectionError } = await supabaseAdmin.from('inspections').select('id,batch_id,organization_id,status,result_summary,measurements,specification_snapshot,reviewer_id,reviewed_at').eq('id', inspectionId).eq('organization_id', orgId).maybeSingle();
  if (inspectionError) throw inspectionError;
  if (!inspection) throw new Error('Inspeksi tidak ditemukan.');
  const { data: batch, error: batchError } = await supabaseAdmin.from('batches').select('id,batch_code,material_id,supplier_id').eq('id', inspection.batch_id).eq('organization_id', orgId).single();
  if (batchError) throw batchError;
  const [material, supplier] = await Promise.all([
    batch.material_id ? supabaseAdmin.from('materials').select('name').eq('id', batch.material_id).single() : Promise.resolve({ data: null, error: null }),
    batch.supplier_id ? supabaseAdmin.from('suppliers').select('name').eq('id', batch.supplier_id).single() : Promise.resolve({ data: null, error: null }),
  ]);
  if (material.error) throw material.error;
  if (supplier.error) throw supplier.error;
  return { inspection, batch, material: material.data?.name || 'Belum ditentukan', supplier: supplier.data?.name || 'Belum ditentukan' };
}
function dbBatchRef(orgId, batchCode) { return keccak256(toUtf8Bytes(`PANDU:${orgId}:${batchCode}`)); }

app.post('/api/organizations/:orgId/proofs', requireSupabaseUser, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
  try {
    if (!process.env.PANDU_REGISTRY_ADDRESS) return res.status(503).json({ error: 'Deploy registry Arbitrum Sepolia dan isi PANDU_REGISTRY_ADDRESS sebelum membuat proof.' });
    if (!process.env.PUBLIC_TOKEN_SECRET || process.env.PUBLIC_TOKEN_SECRET.length < 32) return res.status(503).json({ error: 'PUBLIC_TOKEN_SECRET server belum diatur (minimal 32 karakter).' });
    const { orgId } = req.params;
    await requireOrgRole(req.authUser.id, orgId, ['owner', 'admin', 'qa']);
    const parsed = CreateProofBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Input bukti tidak valid.' });
    const { inspectionId, evidence } = parsed.data;
    let evidenceItems = evidence;
    if (!evidenceItems || !evidenceItems.length) {
      const { data: dbFiles } = await supabaseAdmin.from('evidence_files').select('cid,sha256,original_name').eq('organization_id', orgId).eq('inspection_id', inspectionId);
      evidenceItems = (dbFiles || []).map((f) => {
        const saltMatch = f.original_name?.match(/#salt=([a-fA-F0-9]{64})/);
        return {
          cid: f.cid,
          hmac: String(f.sha256 || '').replace(/^\\x/, ''),
          salt: saltMatch ? saltMatch[1] : randomBytes(32).toString('hex')
        };
      });
    }
    const { inspection, batch, material, supplier } = await getBatchDetails(orgId, inspectionId);
    if (inspection.status !== 'approved' || inspection.result_summary?.result !== 'PASS') return res.status(409).json({ error: 'Bukti hanya dapat dibuat dari inspeksi PASS yang sudah disetujui QA.' });
    const { data: existing } = await supabaseAdmin.from('quality_proofs').select('*').eq('organization_id', orgId).eq('inspection_id', inspectionId).maybeSingle();
    if (existing) return res.json({ proof: existing });
    const proofRowId = randomUUID();
    const publicId = `PANDU-${randomBytes(8).toString('hex').toUpperCase()}`;
    const publicToken = createHmac('sha256', process.env.PUBLIC_TOKEN_SECRET).update(proofRowId).digest('base64url');
    const salt = randomBytes(32).toString('hex');
    const snapshot = {
      canonicalizationVersion: 1,
      proofId: publicId,
      batchRef: batch.batch_code,
      material,
      supplier,
      inspection: { checks: inspection.result_summary.checks, result: inspection.result_summary.result },
      evidence: evidenceItems.map((item) => ({
        cid: item.cid,
        hmac: item.hmac || String(item.sha256 || '').replace(/^\\x/, ''),
        salt: item.salt || randomBytes(32).toString('hex'),
      })).sort((a, b) => a.cid.localeCompare(b.cid)),
      salt,
      approvedAt: inspection.reviewed_at,
    };
    const commitmentValue = `0x${sha256Hex(canonicalJson(snapshot))}`;
    const tokenHash = hexBytes32(sha256Hex(publicToken));
    const { data: proof, error } = await supabaseAdmin.from('quality_proofs').insert({ id: proofRowId, organization_id: orgId, inspection_id: inspectionId, public_id: publicId, public_token_hash: tokenHash, public_snapshot: snapshot, canonicalization_version: 1, commitment: hexBytes32(commitmentValue), chain_id: Number(chainId), contract_address: process.env.PANDU_REGISTRY_ADDRESS, anchor_status: 'not_anchored', created_by: req.authUser.id }).select('*').single();
    if (error) throw error;
    await supabaseAdmin.from('audit_events').insert({ organization_id: orgId, actor_id: req.authUser.id, action: 'quality_proof.created', entity_type: 'quality_proof', entity_id: proof.id });
    res.status(201).json({ proof, verificationUrl: `${origin}/verify/${publicToken}` });
  } catch (error) { res.status(400).json({ error: error.message || 'Gagal membuat bukti PANDU.' }); }
});

app.get('/api/proofs/:proofRowId/share', requireSupabaseUser, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
  if (!process.env.PUBLIC_TOKEN_SECRET || process.env.PUBLIC_TOKEN_SECRET.length < 32) return res.status(503).json({ error: 'PUBLIC_TOKEN_SECRET server belum diatur.' });
  try {
    const { data: proof, error } = await supabaseAdmin.from('quality_proofs').select('id,organization_id,anchor_status').eq('id', req.params.proofRowId).maybeSingle();
    if (error) throw error;
    if (!proof) return res.status(404).json({ error: 'Bukti PANDU tidak ditemukan.' });
    if (!['confirmed', 'revoked'].includes(proof.anchor_status)) return res.status(409).json({ error: 'Tautan publik tersedia setelah bukti tercatat di jaringan.' });
    await requireOrgRole(req.authUser.id, proof.organization_id, ['owner', 'admin', 'qc', 'qa', 'auditor']);
    const token = createHmac('sha256', process.env.PUBLIC_TOKEN_SECRET).update(proof.id).digest('base64url');
    res.json({ url: `${origin}/verify/${token}` });
  } catch (error) { res.status(403).json({ error: error.message || 'Akses bukti ditolak.' }); }
});

app.get('/api/proofs/:proofRowId/sign-payload', requireSupabaseUser, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
  try {
    const { data: proof, error } = await supabaseAdmin.from('quality_proofs').select('*').eq('id', req.params.proofRowId).maybeSingle();
    if (error) throw error;
    if (!proof) return res.status(404).json({ error: 'Bukti tidak ditemukan.' });
    const { batch } = await getBatchDetails(proof.organization_id, proof.inspection_id);
    const domain = {
      name: "PANDUQualityRegistry",
      version: "2",
      chainId: Number(chainId),
      verifyingContract: process.env.PANDU_REGISTRY_ADDRESS
    };
    res.json({
      domain,
      proofId: proofIdBytes(proof.public_id),
      batchRef: dbBatchRef(proof.organization_id, batch.batch_code),
      evidenceHash: `0x${bytes32Hex(proof.commitment)}`,
      snapshot: proof.public_snapshot,
    });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/proofs/:proofRowId/revoke-payload', requireSupabaseUser, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
  try {
    const { data: proof, error } = await supabaseAdmin.from('quality_proofs').select('*').eq('id', req.params.proofRowId).maybeSingle();
    if (error) throw error;
    if (!proof) return res.status(404).json({ error: 'Bukti tidak ditemukan.' });
    const domain = {
      name: "PANDUQualityRegistry",
      version: "2",
      chainId: Number(chainId),
      verifyingContract: process.env.PANDU_REGISTRY_ADDRESS
    };
    const reasonText = req.query.reason || "Pencabutan oleh pengguna";
    res.json({
      domain,
      proofId: proofIdBytes(proof.public_id),
      reasonHash: id(reasonText)
    });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/proofs/:proofRowId/anchor', requireSupabaseUser, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
  let proof;
  try {
    const parsed = AnchorBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Tanda tangan EIP-712 penerbit (signature, attester, deadline) diperlukan.' });
    const { signature, attester, deadline } = parsed.data;

    // Batasi deadline tanda tangan maksimal 15 menit dari waktu sekarang
    const now = Math.floor(Date.now() / 1000);
    const deadlineNum = Number(deadline);
    if (deadlineNum < now) {
      return res.status(400).json({ error: 'Tanda tangan sudah kedaluwarsa (deadline telah lewat).' });
    }
    const MAX_DEADLINE_SECONDS = 15 * 60; // 15 menit
    if (deadlineNum > now + MAX_DEADLINE_SECONDS + 60) {
      return res.status(400).json({ error: 'Deadline tanda tangan maksimal 15 menit dari waktu saat ini.' });
    }

    if (!(await checkRateLimit(`anchor:${req.authUser.id}`))) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });

    const { data, error } = await supabaseAdmin.from('quality_proofs').select('*').eq('id', req.params.proofRowId).maybeSingle();
    if (error) throw error;
    proof = data;
    if (!proof) return res.status(404).json({ error: 'Bukti PANDU tidak ditemukan.' });
    await requireOrgRole(req.authUser.id, proof.organization_id, ['owner', 'admin', 'qa']);
    if (chainName === 'arbitrum-one' && process.env.ENABLE_MAINNET_ANCHOR !== 'true') return res.status(423).json({ error: 'Anchor mainnet dikunci. Uji alur terlebih dahulu di Arbitrum Sepolia.' });
    if (Number(proof.chain_id) !== Number(chainId)) return res.status(409).json({ error: 'Bukti dibuat untuk jaringan lain. Buat proof baru pada jaringan aktif.' });
    if (proof.anchor_status === 'revoked') return res.status(409).json({ error: 'Bukti yang sudah dicabut tidak dapat direkam ulang.' });
    if (!process.env.RELAYER_PRIVATE_KEY || !process.env.PANDU_REGISTRY_ADDRESS) return res.status(503).json({ error: 'Relayer atau alamat kontrak belum dikonfigurasi.' });
    if (getAddress(proof.contract_address) !== getAddress(process.env.PANDU_REGISTRY_ADDRESS)) return res.status(409).json({ error: 'Alamat kontrak aktif tidak cocok dengan kontrak proof ini.' });
    if (proof.anchor_status === 'confirmed') return res.json({ proof });
    const { error: updateError } = await supabaseAdmin.from('quality_proofs').update({ anchor_status: 'pending' }).eq('id', proof.id);
    if (updateError) throw updateError;
    const { batch } = await getBatchDetails(proof.organization_id, proof.inspection_id);
    const provider = getProvider();
    const network = await provider.getNetwork();
    if (network.chainId !== chainId) throw new Error(`RPC tersambung ke ${network.chainId}, seharusnya ${chainLabel} (${chainId}).`);
    const wallet = new Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
    const registry = getRegistry(wallet);
    const relayerRole = await registry.RELAYER_ROLE();
    if (!(await registry.hasRole(relayerRole, wallet.address))) throw new Error(`Wallet relayer ${wallet.address} belum memiliki RELAYER_ROLE pada kontrak.`);
    const idHash = proofIdBytes(proof.public_id);
    const refHash = dbBatchRef(proof.organization_id, batch.batch_code);
    const digest = `0x${bytes32Hex(proof.commitment)}`;
    
    const tx = await sendWithRetry(() => registry.anchorProof(idHash, refHash, digest, attester, deadline, signature), 'anchorProof');
    const receipt = await tx.wait(2);
    if (!receipt || receipt.status !== 1) throw new Error('Transaksi belum berhasil dikonfirmasi di jaringan.');
    const confirmed = await registry.getProof(idHash);
    if (confirmed.evidenceHash.toLowerCase() !== digest.toLowerCase() || confirmed.batchRef.toLowerCase() !== refHash.toLowerCase() || confirmed.revoked) throw new Error('Konfirmasi blockchain tidak cocok dengan bukti tersimpan.');
    const { data: updated, error: saveError } = await supabaseAdmin.from('quality_proofs').update({ anchor_status: 'confirmed', transaction_hash: tx.hash, block_number: receipt.blockNumber }).eq('id', proof.id).select('*').single();
    if (saveError) throw saveError;
    await supabaseAdmin.from('audit_events').insert({ organization_id: proof.organization_id, actor_id: req.authUser.id, action: 'quality_proof.anchored', entity_type: 'quality_proof', entity_id: proof.id, details: { chain_id: Number(chainId), transaction_hash: tx.hash } });
    res.json({ proof: updated, explorerUrl: `${explorerBase}/tx/${tx.hash}`, network: chainLabel });
  } catch (error) {
    if (proof?.id) await supabaseAdmin.from('quality_proofs').update({ anchor_status: 'failed' }).eq('id', proof.id).eq('anchor_status', 'pending');
    const customMsg = mapContractError(error);
    res.status(502).json({ error: customMsg || error.shortMessage || error.message || 'Anchor gagal.' });
  }
});

app.post('/api/proofs/:proofRowId/revoke', requireSupabaseUser, async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase server belum dikonfigurasi.' });
  try {
    const parsed = RevokeBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Alasan revoke (reasonHash) diperlukan.' });
    const { reasonHash, signature, deadline } = parsed.data;

    if (deadline) {
      const now = Math.floor(Date.now() / 1000);
      const deadlineNum = Number(deadline);
      if (deadlineNum < now) {
        return res.status(400).json({ error: 'Tanda tangan sudah kedaluwarsa (deadline telah lewat).' });
      }
      const MAX_DEADLINE_SECONDS = 15 * 60; // 15 menit
      if (deadlineNum > now + MAX_DEADLINE_SECONDS + 60) {
        return res.status(400).json({ error: 'Deadline tanda tangan maksimal 15 menit dari waktu saat ini.' });
      }
    }

    if (!(await checkRateLimit(`revoke:${req.authUser.id}`))) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });

    const { data: proof, error } = await supabaseAdmin.from('quality_proofs').select('*').eq('id', req.params.proofRowId).maybeSingle();
    if (error) throw error;
    if (!proof) return res.status(404).json({ error: 'Bukti PANDU tidak ditemukan.' });
    await requireOrgRole(req.authUser.id, proof.organization_id, ['owner', 'admin', 'qa']);
    if (chainName === 'arbitrum-one' && process.env.ENABLE_MAINNET_ANCHOR !== 'true') return res.status(423).json({ error: 'Pencabutan mainnet dikunci. Aktifkan hanya setelah persetujuan operasional.' });
    if (Number(proof.chain_id) !== Number(chainId)) return res.status(409).json({ error: 'Bukti dibuat di jaringan lain; ganti jaringan sebelum mencabutnya.' });
    if (proof.anchor_status === 'revoked') return res.json({ proof });
    if (proof.anchor_status !== 'confirmed') return res.status(409).json({ error: 'Hanya bukti yang sudah terkonfirmasi dapat dicabut.' });
    if (!process.env.RELAYER_PRIVATE_KEY || !process.env.PANDU_REGISTRY_ADDRESS) return res.status(503).json({ error: 'Relayer atau alamat kontrak belum dikonfigurasi.' });
    if (getAddress(proof.contract_address) !== getAddress(process.env.PANDU_REGISTRY_ADDRESS)) return res.status(409).json({ error: 'Alamat kontrak aktif tidak cocok dengan kontrak proof ini.' });

    const provider = getProvider();
    const network = await provider.getNetwork();
    if (network.chainId !== chainId) throw new Error(`RPC tersambung ke ${network.chainId}, seharusnya ${chainLabel} (${chainId}).`);
    const wallet = new Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
    const registry = getRegistry(wallet);
    const role = await registry.RELAYER_ROLE();
    if (!(await registry.hasRole(role, wallet.address))) throw new Error(`Wallet relayer ${wallet.address} belum memiliki RELAYER_ROLE pada kontrak.`);
    const proofHash = proofIdBytes(proof.public_id);
    const anchored = await registry.getProof(proofHash);
    let transactionHash = proof.revoke_transaction_hash || null;
    let blockNumber = null;
    if (!anchored.revoked) {
      let tx;
      if (signature && deadline) {
        tx = await sendWithRetry(() => registry.revokeProofWithSig(proofHash, reasonHash, deadline, signature), 'revokeProofWithSig');
      } else {
        // Fallback for admin or publisher revoking directly
        tx = await sendWithRetry(() => registry.revokeProof(proofHash, reasonHash), 'revokeProof');
      }
      const receipt = await tx.wait(2);
      if (!receipt || receipt.status !== 1) throw new Error('Transaksi pencabutan belum terkonfirmasi di jaringan.');
      transactionHash = tx.hash;
      blockNumber = receipt.blockNumber;
    }
    const confirmed = await registry.getProof(proofHash);
    if (!confirmed.revoked) throw new Error('Status pencabutan belum terkonfirmasi on-chain.');
    const { data: updated, error: saveError } = await supabaseAdmin.from('quality_proofs').update({ anchor_status: 'revoked', revoked_at: new Date(Number(confirmed.revokedAt) * 1000).toISOString() }).eq('id', proof.id).select('*').single();
    if (saveError) throw saveError;
    await supabaseAdmin.from('audit_events').insert({ organization_id: proof.organization_id, actor_id: req.authUser.id, action: 'quality_proof.revoked', entity_type: 'quality_proof', entity_id: proof.id, details: { chain_id: Number(chainId), transaction_hash: transactionHash } });
    res.json({ proof: updated, transactionHash, blockNumber, explorerUrl: transactionHash ? `${explorerBase}/tx/${transactionHash}` : null, network: chainLabel });
  } catch (error) {
    const customMsg = mapContractError(error);
    res.status(502).json({ error: customMsg || error.shortMessage || error.message || 'Pencabutan gagal.' });
  }
});

// Resolve a printed batch code (e.g. IOT-000111) to the proof link created at QA approval.
app.get('/api/public/resolve', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ status: 'UNAVAILABLE', message: 'Layanan verifikasi Supabase belum dikonfigurasi.' });
  if (!process.env.PUBLIC_TOKEN_SECRET || process.env.PUBLIC_TOKEN_SECRET.length < 32) return res.status(503).json({ status: 'UNAVAILABLE', message: 'Server verifikasi belum dikonfigurasi.' });
  const code = String(req.query.code || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$/.test(code)) return res.status(404).json({ status: 'NOT_FOUND', message: 'Nomor batch tidak ditemukan.' });
  try {
    const { data: batches, error: batchError } = await supabaseAdmin.from('batches').select('id').ilike('batch_code', code.replace(/[%_\\]/g, '\\$&'));
    if (batchError) throw batchError;
    if (!batches?.length) return res.status(404).json({ status: 'NOT_FOUND', message: 'Nomor batch tidak ditemukan.' });
    const { data: inspections, error: inspectionError } = await supabaseAdmin.from('inspections').select('id').in('batch_id', batches.map((b) => b.id));
    if (inspectionError) throw inspectionError;
    if (!inspections?.length) return res.status(404).json({ status: 'NOT_FOUND', message: 'Batch ini belum punya bukti.' });
    const { data: proofs, error: proofError } = await supabaseAdmin.from('quality_proofs').select('id,anchor_status,created_at').in('inspection_id', inspections.map((i) => i.id)).order('created_at', { ascending: false });
    if (proofError) throw proofError;
    if (!proofs?.length) return res.status(404).json({ status: 'NOT_FOUND', message: 'Batch ini belum punya bukti.' });
    const proof = proofs.find((p) => p.anchor_status === 'confirmed') || proofs[0];
    const token = createHmac('sha256', process.env.PUBLIC_TOKEN_SECRET).update(proof.id).digest('base64url');
    res.json({ token });
  } catch (error) { res.status(503).json({ status: 'UNAVAILABLE', message: 'Pencarian belum dapat diproses. Coba lagi.', detail: error.shortMessage || error.message }); }
});

app.get('/api/public/proofs/:token', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ status: 'UNAVAILABLE', message: 'Layanan verifikasi Supabase belum dikonfigurasi.' });
  const token = String(req.params.token || '');
  const byPublicId = /^PANDU-[A-Fa-f0-9]{16}$/.test(token);
  if (!byPublicId && !/^[A-Za-z0-9_-]{32,80}$/.test(token)) return res.status(404).json({ status: 'NOT_FOUND', message: 'Bukti PANDU tidak ditemukan.' });
  try {
    // Manual entry uses the printed proof number (public_id); QR links use the secret token.
    const query = supabaseAdmin.from('quality_proofs').select('*');
    const { data: proof, error } = await (byPublicId ? query.eq('public_id', token.toUpperCase()) : query.eq('public_token_hash', hexBytes32(sha256Hex(token)))).maybeSingle();
    if (error) throw error;
    if (!proof) return res.status(404).json({ status: 'NOT_FOUND', message: 'Bukti PANDU tidak ditemukan.' });
    if (proof.anchor_status !== 'confirmed' && proof.anchor_status !== 'revoked') return res.json({ status: 'PENDING', message: 'Bukti belum tercatat di jaringan publik.' });
    const { batch } = await getBatchDetails(proof.organization_id, proof.inspection_id);
    const proofProvider = getProviderForChain(proof.chain_id);
    const proofNetwork = await proofProvider.getNetwork();
    if (proofNetwork.chainId !== BigInt(proof.chain_id)) throw new Error('RPC verifikasi tersambung ke jaringan yang salah.');
    if (legacyRegistryAddress && getAddress(proof.contract_address) === legacyRegistryAddress) {
      const legacyRegistry = new Contract(legacyRegistryAddress, legacyRegistryAbi, proofProvider);
      const chainProof = await legacyRegistry.getProof(proofIdBytes(proof.public_id));
      const storedCommitment = `0x${bytes32Hex(proof.commitment)}`;
      const snapshotCommitment = `0x${sha256Hex(canonicalJson(proof.public_snapshot))}`;
      const same = chainProof.evidenceHash.toLowerCase() === storedCommitment.toLowerCase()
        && snapshotCommitment.toLowerCase() === storedCommitment.toLowerCase()
        && chainProof.batchRef.toLowerCase() === dbBatchRef(proof.organization_id, batch.batch_code).toLowerCase();
      const status = !same ? 'LEGACY_MISMATCH' : chainProof.revoked ? 'LEGACY_REVOKED' : 'LEGACY_UNSIGNED';
      const message = status === 'LEGACY_UNSIGNED'
        ? 'Legacy v1: catatan cocok, tetapi transaksi anchor tidak memeriksa tanda tangan penerbit.'
        : status === 'LEGACY_REVOKED'
          ? 'Legacy v1: bukti telah dicabut; transaksi anchor tidak memeriksa tanda tangan penerbit.'
          : 'Legacy v1: ringkasan tidak cocok dengan catatan blockchain dan tanda tangan penerbit tidak diperiksa.';
      const proofExplorer = explorerFor(proof.chain_id);
      return res.json({ status, legacy: true, proofId: proofIdBytes(proof.public_id), chainId: Number(proof.chain_id), contractAddress: getAddress(proof.contract_address), proof: proof.public_snapshot, commitment: storedCommitment, transactionHash: proof.transaction_hash, blockNumber: proof.block_number, anchoredAt: Number(chainProof.timestamp), attester: null, relayer: chainProof.attester, revokedAt: Number(chainProof.revokedAt), revoker: chainProof.revoker, revokeReason: null, network: chainLabelFor(proof.chain_id), explorerUrl: proof.transaction_hash ? `${proofExplorer}/tx/${proof.transaction_hash}` : null, message });
    }
    const registry = new Contract(getAddress(proof.contract_address), abi, proofProvider);
    const chainProof = await registry.getProof(proofIdBytes(proof.public_id));
    const storedCommitment = `0x${bytes32Hex(proof.commitment)}`;
    const snapshotCommitment = `0x${sha256Hex(canonicalJson(proof.public_snapshot))}`;
    const same = chainProof.evidenceHash.toLowerCase() === storedCommitment.toLowerCase() && snapshotCommitment.toLowerCase() === storedCommitment.toLowerCase() && chainProof.batchRef.toLowerCase() === dbBatchRef(proof.organization_id, batch.batch_code).toLowerCase();
    const status = chainProof.revoked ? 'REVOKED' : same ? 'VERIFIED' : 'MISMATCH';
    const proofExplorer = explorerFor(proof.chain_id);
    res.json({ status, legacy: false, proofId: proofIdBytes(proof.public_id), chainId: Number(proof.chain_id), contractAddress: getAddress(proof.contract_address), proof: proof.public_snapshot, commitment: storedCommitment, transactionHash: proof.transaction_hash, blockNumber: proof.block_number, anchoredAt: Number(chainProof.timestamp), attester: chainProof.attester, relayer: chainProof.relayer, revokedAt: Number(chainProof.revokedAt), revoker: chainProof.revoker, revokeReason: chainProof.revokeReason, network: chainLabelFor(proof.chain_id), explorerUrl: proof.transaction_hash ? `${proofExplorer}/tx/${proof.transaction_hash}` : null, message: status === 'VERIFIED' ? 'Ringkasan cocok dengan catatan blockchain dan belum dicabut.' : status === 'REVOKED' ? 'Bukti ini sudah dicabut oleh penerbit.' : 'Data ringkasan tidak cocok dengan komitmen di blockchain.' });
  } catch (error) { res.status(503).json({ status: 'UNAVAILABLE', message: 'Jaringan belum dapat memeriksa bukti. Coba lagi.', detail: error.shortMessage || error.message }); }
});

app.get('/api/demo', (_req, res) => res.json(summarize()));
app.post('/api/reset', async (_req, res) => {
  const proofCounter = state.proofCounter || 0;
  const proofArchive = state.proofArchive || [];
  state = seed(); state.proofCounter = proofCounter; state.proofArchive = proofArchive;
  await persist(); res.json(summarize());
});
app.post('/api/demo/tamper', async (_req, res) => {
  if (!state.proof || state.anchor.status !== 'CONFIRMED') return res.status(409).json({ error: 'Rekam proof terlebih dahulu sebelum menjalankan simulasi.' });
  state.batch.supplier = `${state.batch.supplier} (data diubah)`;
  const saved = state.proofArchive.find((entry) => entry.id === state.proof.id);
  if (saved) saved.snapshot.supplier = state.batch.supplier;
  audit('DEMO_TAMPER_SIMULATED'); await persist(); res.json(summarize());
});

app.post('/api/inspection/submit', async (req, res) => {
  const parsed = SubmitInspectionBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Masukkan angka hasil pengukuran.' });
  const { actual, notes } = parsed.data;
  state.inspection.actual = actual;
  state.inspection.notes = (notes || '').slice(0, 500);
  state.inspection.status = actual >= state.inspection.min && actual <= state.inspection.max ? 'SUBMITTED' : 'FAILED';
  state.inspection.submittedAt = new Date().toISOString();
  state.inspection.approvedAt = null;
  state.proof = null;
  state.anchor = { status: 'NOT_ANCHORED', transactionHash: null, blockNumber: null, error: null };
  audit(state.inspection.status === 'SUBMITTED' ? 'INSPECTION_SUBMITTED' : 'INSPECTION_FAILED');
  await persist();
  res.json(summarize());
});

app.post('/api/evidence', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih file bukti terlebih dahulu.' });
  try {
    const bytes = await readFile(req.file.path);
    const sha256Hash = createHash('sha256').update(bytes).digest('hex');
    
    // Upload to Pinata
    const formData = new FormData();
    formData.append('file', new Blob([bytes]), req.file.originalname);
    
    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.PINATA_JWT}` },
      body: formData
    });
    
    if (!pinataRes.ok) throw new Error('Gagal mengunggah ke Pinata');
    const pinataData = await pinataRes.json();
    const cid = pinataData.IpfsHash;
    
    // Delete local temp file
    await import('node:fs/promises').then(fs => fs.unlink(req.file.path).catch(() => {}));
    
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (token) {
      // Authenticated request (Supabase mode)
      return res.status(201).json({ cid, sha256: sha256Hash, name: req.file.originalname });
    }

    // Local demo mode
    const item = { id: randomUUID(), name: path.basename(req.file.originalname), mimeType: req.file.mimetype, size: req.file.size, sha256: sha256Hash, addedAt: new Date().toISOString(), cid };
    state.evidence.push(item); state.proof = null;
    if (state.inspection.status === 'APPROVED') {
      state.inspection.status = 'SUBMITTED';
      state.inspection.submittedAt = new Date().toISOString();
      state.inspection.approvedAt = null;
    }
    audit('EVIDENCE_UPLOADED'); await persist();
    res.status(201).json(summarize());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Local demo only: no identity/access layer is configured, so keep this API loopback-bound.
app.get('/api/evidence/:id', (req, res, next) => {
  const item = state.evidence.find((entry) => entry.id === req.params.id);
  if (!item || !item.storagePath) return res.status(404).json({ error: 'Berkas bukti tidak ditemukan.' });
  res.download(item.storagePath, item.name, (error) => { if (error && !res.headersSent) next(error); });
});

app.post('/api/qa/approve', async (_req, res) => {
  if (state.inspection.status !== 'SUBMITTED') return res.status(409).json({ error: 'Pemeriksaan yang menunggu review saja yang dapat disetujui.' });
  state.inspection.status = 'APPROVED'; state.inspection.approvedAt = new Date().toISOString();
  audit('INSPECTION_APPROVED', 'QA MANAGER'); await persist(); res.json(summarize());
});

app.post('/api/proof', async (_req, res) => {
  if (state.inspection.status !== 'APPROVED') return res.status(409).json({ error: 'Setujui pemeriksaan sebagai QA sebelum membuat bukti PANDU.' });
  state.proofCounter = (state.proofCounter || 0) + 1;
  state.proof = { id: `PANDU-QP-2026-${String(state.proofCounter).padStart(6, '0')}`, createdAt: new Date().toISOString(), canonicalizationVersion: 1 };
  state.anchor = { status: 'NOT_ANCHORED', transactionHash: null, blockNumber: null, error: null };
  const snapshot = buildPublicProof();
  state.proof.commitment = commitment(snapshot);
  state.proofArchive.push({ id: state.proof.id, snapshot, commitment: state.proof.commitment, batchRef: batchRefBytes(snapshot.batchRef), createdAt: state.proof.createdAt, anchor: { ...state.anchor } });
  audit('QUALITY_PROOF_CREATED', 'QA MANAGER'); await persist(); res.status(201).json(summarize());
});

app.post('/api/anchor', async (_req, res) => {
  if (!state.proof || state.inspection.status !== 'APPROVED') return res.status(409).json({ error: 'Buat proof dari pemeriksaan yang sudah disetujui terlebih dahulu.' });
  if (!process.env.RELAYER_PRIVATE_KEY) return res.status(503).json({ error: 'Relayer belum siap. Atur RELAYER_PRIVATE_KEY di backend/.env.' });
  if (chainName === 'arbitrum-one' && process.env.ENABLE_MAINNET_ANCHOR !== 'true') return res.status(423).json({ error: 'Pencatatan mainnet dinonaktifkan. Aktifkan ENABLE_MAINNET_ANCHOR=true hanya setelah pemeriksaan produksi disetujui.' });
  if (state.anchor.status === 'CONFIRMED') return res.json(summarize());
  state.anchor = { status: 'PENDING', transactionHash: null, blockNumber: null, error: null };
  const pendingProof = state.proofArchive.find((entry) => entry.id === state.proof.id);
  if (pendingProof) pendingProof.anchor = { ...state.anchor };
  await persist();
  try {
    const provider = getProvider();
    const network = await provider.getNetwork();
    if (network.chainId !== chainId) throw new Error(`RPC tersambung ke chain ${network.chainId}, bukan Arbitrum Sepolia.`);
    const wallet = new Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
    const registry = getRegistry(wallet);
    const relayerRole = await registry.RELAYER_ROLE();
    if (!(await registry.hasRole(relayerRole, wallet.address))) throw new Error(`Wallet relayer ${wallet.address} belum memiliki RELAYER_ROLE pada kontrak.`);
    const proofId = proofIdBytes(state.proof.id);
    const batchRef = batchRefBytes(state.batch.id);
    const savedProof = state.proofArchive.find((entry) => entry.id === state.proof.id);
    if (!savedProof) throw new Error('Snapshot proof tidak ditemukan. Buat ulang proof sebelum anchor.');
    const digest = savedProof.commitment;
    if (digest.toLowerCase() !== state.proof.commitment.toLowerCase()) throw new Error('Komitmen berubah setelah proof dibuat. Buat ulang proof sebelum anchor.');
    // On RPC timeout the job stays UNKNOWN, then the next request reconciles by reading chain first.
    try {
      const existing = await registry.getProof(proofId);
      if (existing.evidenceHash.toLowerCase() === digest.toLowerCase() && existing.batchRef.toLowerCase() === batchRef.toLowerCase()) {
        state.anchor = { status: existing.revoked ? 'REVOKED' : 'CONFIRMED', transactionHash: null, blockNumber: null, error: null };
        savedProof.anchor = { ...state.anchor };
        await persist(); return res.json(summarize());
      }
      throw new Error('Proof ID sudah dipakai dengan data lain.');
    } catch (readError) {
      const selector = registry.interface.getError('ProofNotFound').selector.toLowerCase();
      const revertData = [readError.data, readError.info?.error?.data, readError.error?.data].find((value) => typeof value === 'string' && value.startsWith('0x'));
      if (!revertData || revertData.slice(0, 10).toLowerCase() !== selector) throw readError;
    }
    const { signature, attester, deadline } = req.body || {};
    if (!signature || !attester || !deadline) {
      return res.status(400).json({ error: 'Pada kontrak v2, anchorProof memerlukan tanda tangan EIP-712 dari penerbit (attester, deadline, signature). Kunci penerbit tidak disimpan di server.' });
    }
    const now = Math.floor(Date.now() / 1000);
    const deadlineNum = Number(deadline);
    if (deadlineNum < now) {
      return res.status(400).json({ error: 'Tanda tangan sudah kedaluwarsa (deadline telah lewat).' });
    }
    const MAX_DEADLINE_SECONDS = 15 * 60;
    if (deadlineNum > now + MAX_DEADLINE_SECONDS + 60) {
      return res.status(400).json({ error: 'Deadline tanda tangan maksimal 15 menit dari waktu saat ini.' });
    }
    const tx = await sendWithRetry(
      () => registry.anchorProof(proofId, batchRef, digest, attester, deadline, signature),
      'anchorProof'
    );
    state.anchor.transactionHash = tx.hash; await persist();
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error('Transaksi gagal pada jaringan.');
    const anchored = await registry.getProof(proofId);
    if (anchored.batchRef.toLowerCase() !== batchRef.toLowerCase() || anchored.evidenceHash.toLowerCase() !== digest.toLowerCase() || anchored.revoked) {
      throw new Error('Receipt berhasil, tetapi data kontrak tidak cocok dengan proof.');
    }
    state.anchor = { status: 'CONFIRMED', transactionHash: tx.hash, blockNumber: receipt.blockNumber, error: null };
    savedProof.anchor = { ...state.anchor };
    audit('PROOF_ANCHORED', wallet.address); await persist(); res.json(summarize());
  } catch (error) {
    state.anchor = { ...state.anchor, status: state.anchor.transactionHash ? 'PENDING' : 'FAILED', error: error.shortMessage || error.message };
    const savedProof = state.proofArchive.find((entry) => entry.id === state.proof?.id);
    if (savedProof) savedProof.anchor = { ...state.anchor };
    await persist();
    const customMsg = mapContractError(error);
    res.status(502).json({ ...summarize(), error: customMsg || error.shortMessage || error.message });
  }
});

app.post('/api/revoke', async (req, res) => {
  if (!state.proof || state.anchor.status !== 'CONFIRMED') return res.status(409).json({ error: 'Hanya proof yang sudah terekam yang dapat dicabut.' });
  if (!process.env.RELAYER_PRIVATE_KEY) return res.status(503).json({ error: 'Relayer belum siap. Atur RELAYER_PRIVATE_KEY di backend/.env.' });
  if (chainName === 'arbitrum-one' && process.env.ENABLE_MAINNET_ANCHOR !== 'true') return res.status(423).json({ error: 'Pencabutan mainnet dinonaktifkan. Aktifkan ENABLE_MAINNET_ANCHOR=true hanya setelah pemeriksaan produksi disetujui.' });
  try {
    const provider = getProvider(); const wallet = new Wallet(process.env.RELAYER_PRIVATE_KEY || '', provider);
    const registry = getRegistry(wallet);
    const { reasonHash, signature, deadline } = req.body || {};
    if (deadline) {
      const now = Math.floor(Date.now() / 1000);
      const deadlineNum = Number(deadline);
      if (deadlineNum < now) {
        return res.status(400).json({ error: 'Tanda tangan sudah kedaluwarsa (deadline telah lewat).' });
      }
      const MAX_DEADLINE_SECONDS = 15 * 60;
      if (deadlineNum > now + MAX_DEADLINE_SECONDS + 60) {
        return res.status(400).json({ error: 'Deadline tanda tangan maksimal 15 menit dari waktu saat ini.' });
      }
    }
    const reason = reasonHash || id('Pencabutan bukti demo');
    let tx;
    if (signature && deadline) {
      tx = await sendWithRetry(
        () => registry.revokeProofWithSig(proofIdBytes(state.proof.id), reason, deadline, signature),
        'revokeProofWithSig'
      );
    } else {
      tx = await sendWithRetry(
        () => registry.revokeProof(proofIdBytes(state.proof.id), reason),
        'revokeProof'
      );
    }
    const receipt = await tx.wait(1);
    if (!receipt || receipt.status !== 1) throw new Error('Transaksi pencabutan gagal.');
    const proof = await registry.getProof(proofIdBytes(state.proof.id));
    if (!proof.revoked) throw new Error('Status revoke belum terkonfirmasi on-chain.');
    state.anchor = { ...state.anchor, status: 'REVOKED', revokeTransactionHash: tx.hash, revokeBlockNumber: receipt.blockNumber };
    const savedProof = state.proofArchive.find((entry) => entry.id === state.proof.id);
    if (savedProof) savedProof.anchor = { ...state.anchor };
    audit('PROOF_REVOKED', wallet.address); await persist(); res.json(summarize());
  } catch (error) {
    const customMsg = mapContractError(error);
    res.status(502).json({ error: customMsg || error.shortMessage || error.message });
  }
});

async function verifyProof(proofId) {
  const savedProof = (state.proofArchive || []).find((entry) => entry.id === proofId);
  if (!savedProof) return { status: 'NOT_FOUND', message: 'Bukti PANDU tidak ditemukan.' };
  try {
    const provider = getProvider(); const registry = getRegistry(provider);
    const proof = await registry.getProof(proofIdBytes(proofId));
    const digest = commitment(savedProof.snapshot);
    const same = proof.evidenceHash.toLowerCase() === digest.toLowerCase() && proof.batchRef.toLowerCase() === savedProof.batchRef.toLowerCase();
    const status = proof.revoked ? 'REVOKED' : same ? 'VERIFIED' : 'MISMATCH';
    return { status, proof: savedProof.snapshot, commitment: digest, anchoredCommitment: proof.evidenceHash, anchoredAt: Number(proof.timestamp), attester: proof.attester, transactionHash: savedProof.anchor?.transactionHash, blockNumber: savedProof.anchor?.blockNumber, network: chainLabel, explorerUrl: savedProof.anchor?.transactionHash ? `${explorerBase}/tx/${savedProof.anchor.transactionHash}` : null, message: status === 'VERIFIED' ? 'Ringkasan ini sama dengan bukti yang direkam dan belum dicabut.' : status === 'REVOKED' ? 'Bukti ini pernah direkam, tetapi kemudian dicabut.' : 'Ringkasan yang dibuka berbeda dari bukti yang direkam.' };
  } catch (error) {
    return { status: 'UNAVAILABLE', message: 'Jaringan belum dapat memeriksa bukti. Coba lagi sebentar.', detail: error.shortMessage || error.message };
  }
}
app.get('/api/verify', async (_req, res) => {
  if (!state.proof) return res.status(404).json({ status: 'NOT_FOUND', message: 'Bukti PANDU belum dibuat.' });
  const result = await verifyProof(state.proof.id);
  res.status(result.status === 'UNAVAILABLE' ? 503 : 200).json(result);
});
app.get('/api/verify/:proofId', async (req, res) => {
  const result = await verifyProof(req.params.proofId);
  res.status(result.status === 'UNAVAILABLE' ? 503 : 200).json(result);
});

app.use((error, _req, res, _next) => res.status(400).json({ error: error.message || 'Permintaan tidak valid.' }));
await mkdir(path.dirname(dataFile), { recursive: true });
await mkdir(uploadDir, { recursive: true });
await loadState();
app.listen(port, '127.0.0.1', () => console.log(`PANDU API listening on http://localhost:${port}`));
