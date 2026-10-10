/**
 * PANDU Selective Disclosure Merkle Tree
 *
 * Struktur mengikuti RFC 6962 §2.1 dengan pemisahan domain:
 *   leaf : H(0x00 || leafData)
 *   node : H(0x01 || left || right)
 *
 * Leaf ganjil (jumlah node ganjil pada suatu level) DIPROMOSIKAN TANPA DIHITUNG
 * ULANG ke level berikutnya — sama dengan bentuk pohon rekursif RFC 6962
 * (k = pangkat dua terbesar < n), diverifikasi terhadap contoh 7-leaf RFC 6962.
 *
 * Penyimpangan terhadap RFC 6962 terdokumentasi di
 * documentation/SELECTIVE_DISCLOSURE_MERKLE_DESIGN.md bagian "Penyimpangan".
 */
import { canonicalJson } from './crypto';

export const MERKLE_LEAF_PREFIX = 0x00;
export const MERKLE_NODE_PREFIX = 0x01;
export const MERKLE_VERSION = 'pandu-merkle-v1';

export interface MerkleLeaf {
  path: string;
  salt: string;
  value: unknown;
}

export interface MerkleProofStep {
  /** hash saudara (sibling) pada level tersebut, hex tanpa 0x */
  sibling: string;
  /** true jika sibling berada di sebelah KANAN node saat ini */
  isRight: boolean;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return new Uint8Array(digest);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Preimage kanonikal leaf: canonicalJson({path, salt, value}) dengan urutan key alfabetis. */
export function canonicalLeafData(leaf: MerkleLeaf): string {
  return canonicalJson({ path: leaf.path, salt: leaf.salt, value: leaf.value });
}

/** Leaf hash = SHA-256(0x00 || canonicalLeafData) */
export async function hashMerkleLeaf(leaf: MerkleLeaf): Promise<Uint8Array> {
  const data = new TextEncoder().encode(canonicalLeafData(leaf));
  const preimage = new Uint8Array(1 + data.length);
  preimage[0] = MERKLE_LEAF_PREFIX;
  preimage.set(data, 1);
  return await sha256(preimage);
}

/** Node hash = SHA-256(0x01 || left || right) — urutan anak TIDAK diurutkan (sesuai RFC 6962). */
export async function hashMerkleNode(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  const preimage = new Uint8Array(1 + left.length + right.length);
  preimage[0] = MERKLE_NODE_PREFIX;
  preimage.set(left, 1);
  preimage.set(right, 1 + left.length);
  return await sha256(preimage);
}

/** Urutkan leaf berdasarkan path (leksikografis) agar pemilihan pohon deterministik. */
export function sortLeavesByPath(leaves: MerkleLeaf[]): MerkleLeaf[] {
  return [...leaves].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Bangun seluruh level pohon dari daftar hash leaf.
 * Level ganjil: node terakhir dipromosikan apa adanya (tanpa hash ulang).
 */
export async function buildMerkleLevels(leafHashes: Uint8Array[]): Promise<Uint8Array[][]> {
  if (!Array.isArray(leafHashes) || leafHashes.length === 0) {
    throw new Error('Pohon Merkle membutuhkan minimal satu leaf.');
  }
  const levels: Uint8Array[][] = [leafHashes];
  let current = leafHashes;
  while (current.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(await hashMerkleNode(current[i], current[i + 1]));
      } else {
        next.push(current[i]); // leaf/node ganjil dipromosikan
      }
    }
    levels.push(next);
    current = next;
  }
  return levels;
}

/** Merkle root dari daftar leaf (sudah diurutkan path). Hex dengan prefix 0x. */
export async function computeMerkleRoot(leaves: MerkleLeaf[]): Promise<string> {
  const sorted = sortLeavesByPath(leaves);
  const leafHashes = await Promise.all(sorted.map((leaf) => hashMerkleLeaf(leaf)));
  const levels = await buildMerkleLevels(leafHashes);
  return `0x${toHex(levels[levels.length - 1][0])}`;
}

/**
 * Audit path untuk leaf pada index TERTENTU dalam daftar leaf terurut.
 * Mengembalikan rantai sibling dari leaf menuju root.
 */
export async function merkleAuditPath(leafHashes: Uint8Array[], index: number): Promise<MerkleProofStep[]> {
  if (index < 0 || index >= leafHashes.length) throw new Error('Index leaf di luar jangkauan.');
  const levels = await buildMerkleLevels(leafHashes);
  const path: MerkleProofStep[] = [];
  let idx = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l];
    // Node terakhir pada level berjumlah GANJIL: dipromosikan tanpa sibling.
    const promoted = level.length % 2 === 1 && idx === level.length - 1;
    if (!promoted) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      path.push({ sibling: toHex(level[siblingIdx]), isRight: siblingIdx > idx });
    }
    idx = Math.floor(idx / 2);
  }
  return path;
}

/** Verifikasi audit path: rekonstruksi root dari leaf hash + sibling chain. */
export async function verifyAuditPath(
  leafHash: Uint8Array,
  auditPath: MerkleProofStep[],
  expectedRootHex: string
): Promise<boolean> {
  let current = leafHash;
  for (const step of auditPath) {
    const sibling = fromHex(step.sibling);
    current = step.isRight ? await hashMerkleNode(current, sibling) : await hashMerkleNode(sibling, current);
  }
  const expected = expectedRootHex.startsWith('0x') ? expectedRootHex.slice(2) : expectedRootHex;
  return toHex(current).toLowerCase() === expected.toLowerCase();
}

/**
 * Paket selective disclosure untuk SATU leaf: nilai + salt + audit path.
 * Salt leaf yang tidak diungkap TIDAK pernah ikut dalam paket.
 */
export interface DisclosurePackage {
  version: typeof MERKLE_VERSION;
  root: string;
  disclosed: Array<{
    path: string;
    value: unknown;
    salt: string;
    auditPath: MerkleProofStep[];
  }>;
}

export async function buildDisclosurePackage(
  leaves: MerkleLeaf[],
  disclosedPaths: string[]
): Promise<DisclosurePackage> {
  const sorted = sortLeavesByPath(leaves);
  const leafHashes = await Promise.all(sorted.map((leaf) => hashMerkleLeaf(leaf)));
  const root = await computeMerkleRoot(leaves);
  const disclosed: DisclosurePackage['disclosed'] = [];
  for (const path of disclosedPaths) {
    const index = sorted.findIndex((leaf) => leaf.path === path);
    if (index < 0) throw new Error(`Leaf "${path}" tidak ditemukan pada bukti ini.`);
    disclosed.push({
      path,
      value: sorted[index].value,
      salt: sorted[index].salt,
      auditPath: await merkleAuditPath(leafHashes, index),
    });
  }
  return { version: MERKLE_VERSION, root, disclosed };
}

/** Verifikasi paket disclosure terhadap root (on-chain commitment). */
export async function verifyDisclosurePackage(pkg: DisclosurePackage, expectedRootHex: string): Promise<boolean> {
  if (pkg.root.toLowerCase() !== expectedRootHex.toLowerCase()) return false;
  for (const item of pkg.disclosed) {
    const leafHash = await hashMerkleLeaf({ path: item.path, salt: item.salt, value: item.value });
    if (!(await verifyAuditPath(leafHash, item.auditPath, expectedRootHex))) return false;
  }
  return true;
}
