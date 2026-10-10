/**
 * Generator test vector lintas implementasi (Node.js) untuk PANDU.
 *
 * Menghasilkan:
 *  - test-vectors/recovery-kdf-vectors.json           (PBKDF2-SHA256 KEK recovery)
 *  - test-vectors/merkle-selective-disclosure-vectors.json (Merkle RFC 6962 + leaf salted)
 *
 * Kedua vektor dihitung dengan implementasi INDEPENDEN di skrip ini (node:crypto dan
 * rekurusi RFC 6962 §2.1 murni), sehingga unit test frontend membuktikan paritas,
 * bukan sekadar mengulang hasil implementasi yang sama.
 *
 * Jalankan: node test-vectors/generate-vectors.mjs
 */
import { pbkdf2Sync, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sha256 = (...bufs) => createHash('sha256').update(Buffer.concat(bufs)).digest();
const hex = (buf) => Buffer.from(buf).toString('hex');

/* ------------------------------------------------------------------ *
 * 1. Vektor KDF recovery (PBKDF2-SHA256)
 * ------------------------------------------------------------------ */
const kdfVectors = {
  description:
    'Vektor KDF KEK recovery PANDU: PBKDF2-SHA256 minimal 600.000 iterasi (Argon2id direkomendasikan untuk iterasi berikutnya).',
  kdf: 'PBKDF2-SHA256',
  minimumIterations: 600000,
  minimumPassphraseLength: 12,
  vectors: [
    {
      description: 'Passphrase standar, 600.000 iterasi, salt 16 byte',
      passphrase: 'PANDU-recovery-2026-A1',
      saltHex: '00112233445566778899aabbccddeeff',
      iterations: 600000,
      derivedKeyHex: '',
    },
    {
      description: 'Passphrase panjang dengan spasi dan simbol, 600.000 iterasi',
      passphrase: 'correct horse battery staple 2026!',
      saltHex: 'ffee ddbb aa99 8877 6655 4433 2211 0099'.replace(/\s/g, ''),
      iterations: 600000,
      derivedKeyHex: '',
    },
    {
      description: 'Regresi format lama: metadata tersimpan 100.000 iterasi tetap dapat dibuka',
      passphrase: 'legacy-passphrase-1',
      saltHex: '0123456789abcdef0123456789abcdef',
      iterations: 100000,
      derivedKeyHex: '',
    },
  ],
  invalidPassphrases: [
    { value: 'short', reason: 'panjang < 12' },
    { value: 'abcdefghijk', reason: 'tanpa angka' },
    { value: '123456789012', reason: 'tanpa huruf' },
    { value: 'aaaaaaaaaaaaaaaa', reason: 'satu karakter berulang' },
  ],
};

for (const vector of kdfVectors.vectors) {
  vector.derivedKeyHex = pbkdf2Sync(
    Buffer.from(vector.passphrase, 'utf8'),
    Buffer.from(vector.saltHex, 'hex'),
    vector.iterations,
    32,
    'sha256'
  ).toString('hex');
}

/* ------------------------------------------------------------------ *
 * 2. Vektor Merkle Selective Disclosure (RFC 6962 §2.1)
 * ------------------------------------------------------------------ */

/** Preimage leaf PANDU: canonicalJson({path, salt, value}) dengan key terurut alfabetis. */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

const leafHash = (data) => sha256(Buffer.from([0x00]), Buffer.from(data, 'utf8'));
const nodeHash = (l, r) => sha256(Buffer.from([0x01]), Buffer.from(l), Buffer.from(r));

/** MTH rekursif RFC 6962 §2.1: k = pangkat dua terbesar yang lebih kecil dari n. */
function mth(list) {
  if (list.length === 0) return sha256(Buffer.alloc(0));
  if (list.length === 1) return list[0];
  let k = 1;
  while (k * 2 < list.length) k *= 2;
  return nodeHash(mth(list.slice(0, k)), mth(list.slice(k)));
}

/** PATH rekursif RFC 6962 §2.1.1, diurutkan dari leaf ke root. */
function rfcAuditPath(index, list) {
  if (list.length === 1) return [];
  let k = 1;
  while (k * 2 < list.length) k *= 2;
  if (index < k) {
    return [...rfcAuditPath(index, list.slice(0, k)), { sibling: hex(mth(list.slice(k))), isRight: true }];
  }
  return [...rfcAuditPath(index - k, list.slice(k)), { sibling: hex(mth(list.slice(0, k))), isRight: false }];
}

const SALT = (n) => n.repeat(64).slice(0, 64);
const exampleLeaves = [
  { path: 'version', value: 1, salt: SALT('a1') },
  { path: 'proofId', value: 'PANDU-8F3A19B2', salt: SALT('b2') },
  { path: 'batchRef', value: 'BATCH-2026-X', salt: SALT('c3') },
  { path: 'material', value: 'Semen Portland Tipe I', salt: SALT('d4') },
  { path: 'supplier', value: 'PT Indocement Tunggal Tbk', salt: SALT('e5') },
  { path: 'inspection.result', value: 'PASS', salt: SALT('f6') },
  { path: 'inspection.checks', value: [{ key: 'kadar_air', pass: true }], salt: SALT('07') },
  { path: 'evidence[0].cid', value: 'QmZtmD2qtQgLtGuxUoo7773Ku6ZjfNVNyd47vEDALGBLqY', salt: SALT('18') },
];

function buildVector(leaves, description) {
  const sorted = [...leaves].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hashes = sorted.map((leaf) => leafHash(canonicalJson({ path: leaf.path, salt: leaf.salt, value: leaf.value })));
  const auditPaths = {};
  sorted.forEach((leaf, index) => {
    auditPaths[leaf.path] = rfcAuditPath(index, hashes);
  });
  return {
    description,
    sortedPaths: sorted.map((leaf) => leaf.path),
    root: hex(mth(hashes)),
    leafHashes: hashes.map(hex),
    auditPaths,
    leaves: sorted,
  };
}

const merkleVectors = {
  description:
    'Vektor Merkle PANDU: domain leaf 0x00 / node 0x01 (RFC 6962 §2.1), leaf ganjil dipromosikan, urutan leaf berdasarkan path.',
  leafPrefix: '0x00',
  nodePrefix: '0x01',
  leafPreimage: 'canonicalJson({path, salt, value})',
  cases: [
    buildVector(exampleLeaves.slice(0, 8), '8 leaf (pohon penuh, tanpa promosi)'),
    buildVector(exampleLeaves.slice(0, 7), '7 leaf ganjil (leaf terakhir dipromosikan)'),
    buildVector(exampleLeaves.slice(0, 3), '3 leaf ganjil (kasus terkecil dengan promosi)'),
    buildVector(exampleLeaves.slice(0, 1), '1 leaf (root = hash leaf, sesuai MTH({d(0)}))'),
  ],
  // Contoh 7-leaf RFC 6962 §2.1.3: bentuk pohon & audit path identik (d0 -> [b,h,l], d6 -> [i,k])
  rfc6962Example: {
    description: 'Bentuk pohon 7-leaf mengikuti RFC 6962 §2.1.3 (audit path d0 = [b,h,l], d6 = [i,k])',
    dataEntries: Array.from({ length: 7 }, (_, i) => `leaf-${i}`),
    leafHashes: [],
    auditPathLengthByIndex: {},
    expectedAuditPathLengths: [3, 3, 3, 3, 3, 3, 2],
    root: '',
  },
};

const rfcLeafHashes = merkleVectors.rfc6962Example.dataEntries.map((d) => leafHash(d));
merkleVectors.rfc6962Example.leafHashes = rfcLeafHashes.map(hex);
merkleVectors.rfc6962Example.root = hex(mth(rfcLeafHashes));
rfcLeafHashes.forEach((_, index) => {
  merkleVectors.rfc6962Example.auditPathLengthByIndex[index] = rfcAuditPath(index, rfcLeafHashes).length;
});
const measuredLengths = rfcLeafHashes.map((_, index) => rfcAuditPath(index, rfcLeafHashes).length);
if (JSON.stringify(measuredLengths) !== JSON.stringify(merkleVectors.rfc6962Example.expectedAuditPathLengths)) {
  throw new Error(
    `Bentuk pohon 7-leaf tidak sesuai RFC 6962 §2.1.3: ${JSON.stringify(measuredLengths)} != ${JSON.stringify(
      merkleVectors.rfc6962Example.expectedAuditPathLengths
    )}`
  );
}

/* ------------------------------------------------------------------ *
 * Tulis file
 * ------------------------------------------------------------------ */
writeFileSync(path.join(__dirname, 'recovery-kdf-vectors.json'), `${JSON.stringify(kdfVectors, null, 2)}\n`);
writeFileSync(
  path.join(__dirname, 'merkle-selective-disclosure-vectors.json'),
  `${JSON.stringify(merkleVectors, null, 2)}\n`
);
console.log('test-vectors/recovery-kdf-vectors.json dan test-vectors/merkle-selective-disclosure-vectors.json dibuat.');
