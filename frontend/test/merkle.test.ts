import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  canonicalLeafData,
  hashMerkleLeaf,
  hashMerkleNode,
  buildMerkleLevels,
  computeMerkleRoot,
  merkleAuditPath,
  verifyAuditPath,
  sortLeavesByPath,
  buildDisclosurePackage,
  verifyDisclosurePackage,
  toHex,
  MERKLE_LEAF_PREFIX,
  MERKLE_NODE_PREFIX,
  type MerkleLeaf,
} from '../src/merkle';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../test-vectors/merkle-selective-disclosure-vectors.json'), 'utf8')
);

const sha256 = (...parts: Uint8Array[]) =>
  new Uint8Array(createHash('sha256').update(Buffer.concat(parts.map((p) => Buffer.from(p)))).digest());

describe('Domain separation leaf/node (prefix 0x00 / 0x01)', () => {
  it('prefix konstan sesuai RFC 6962 §2.1', () => {
    expect(MERKLE_LEAF_PREFIX).toBe(0x00);
    expect(MERKLE_NODE_PREFIX).toBe(0x01);
  });

  it('leaf hash = SHA-256(0x00 || canonicalJson({path,salt,value}))', async () => {
    const leaf: MerkleLeaf = { path: 'proofId', value: 'PANDU-1', salt: 'ab'.repeat(32) };
    const data = new TextEncoder().encode(canonicalLeafData(leaf));
    const expected = sha256(new Uint8Array([0x00]), data);
    expect(toHex(await hashMerkleLeaf(leaf))).toBe(toHex(expected));
  });

  it('node hash = SHA-256(0x01 || left || right) tanpa pengurutan anak', async () => {
    const left = sha256(new TextEncoder().encode('kiri'));
    const right = sha256(new TextEncoder().encode('kanan'));
    expect(toHex(await hashMerkleNode(left, right))).toBe(toHex(sha256(new Uint8Array([0x01]), left, right)));
    expect(toHex(await hashMerkleNode(left, right))).not.toBe(toHex(await hashMerkleNode(right, left)));
  });

  it('leaf tidak dapat disamarkan sebagai node (second preimage resistance)', async () => {
    const leaf: MerkleLeaf = { path: 'inspection.result', value: 'PASS', salt: 'cd'.repeat(32) };
    const leafHash = await hashMerkleLeaf(leaf);
    const data = new TextEncoder().encode(canonicalLeafData(leaf));
    const forgedNode = sha256(new Uint8Array([0x01]), leafHash.subarray(0, 16), leafHash.subarray(16));
    expect(toHex(forgedNode)).not.toBe(toHex(leafHash));
    expect(data.length).toBeGreaterThan(0);
  });
});

describe('Test vector Merkle (dihasilkan rekurusi RFC 6962 independen)', () => {
  vectors.cases.forEach((testCase: any, caseIndex: number) => {
    it(`[Case ${caseIndex + 1}] ${testCase.description}`, async () => {
      const leaves: MerkleLeaf[] = testCase.leaves;
      const sorted = sortLeavesByPath(leaves);
      expect(sorted.map((leaf) => leaf.path)).toEqual(testCase.sortedPaths);

      const leafHashes = await Promise.all(sorted.map((leaf) => hashMerkleLeaf(leaf)));
      expect(leafHashes.map(toHex)).toEqual(testCase.leafHashes);

      const root = await computeMerkleRoot(leaves);
      expect(root).toBe(`0x${testCase.root}`);

      // Audit path per leaf identik dengan vektor RFC (urutan leaf -> root)
      for (let index = 0; index < sorted.length; index++) {
        const path = await merkleAuditPath(leafHashes, index);
        expect(path).toEqual(testCase.auditPaths[sorted[index].path]);
        expect(await verifyAuditPath(leafHashes[index], path, root)).toBe(true);
      }
    });
  });

  it('audit path palsu / root palsu ditolak', async () => {
    const testCase = vectors.cases[1];
    const sorted = sortLeavesByPath(testCase.leaves as MerkleLeaf[]);
    const leafHashes = await Promise.all(sorted.map((leaf) => hashMerkleLeaf(leaf)));
    const root = `0x${testCase.root}`;
    const path = await merkleAuditPath(leafHashes, 0);

    const tampered = JSON.parse(JSON.stringify(path));
    tampered[0].sibling = 'ff'.repeat(32);
    expect(await verifyAuditPath(leafHashes[0], tampered, root)).toBe(false);

    const wrongRoot = `0x${'ff'.repeat(32)}`;
    expect(await verifyAuditPath(leafHashes[0], path, wrongRoot)).toBe(false);
  });

  it('menolak pohon tanpa leaf', async () => {
    await expect(computeMerkleRoot([])).rejects.toThrow(/minimal satu leaf/);
  });
});

describe('Bentuk pohon ganjil = RFC 6962 §2.1.3 (7 leaf, promosi node terakhir)', () => {
  it('audit path d0 = [b,h,l] (3 langkah) dan d6 = [i,k] (2 langkah, tanpa sibling di level daun)', async () => {
    const example = vectors.rfc6962Example;
    const leafHashes = example.leafHashes.map((hex: string) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      return bytes;
    });

    const levels = await buildMerkleLevels(leafHashes);
    expect(toHex(levels[levels.length - 1][0])).toBe(example.root);

    const lengths = await Promise.all(
      leafHashes.map(async (_, index) => (await merkleAuditPath(leafHashes, index)).length)
    );
    expect(lengths).toEqual(example.expectedAuditPathLengths);
    expect(lengths).toEqual([3, 3, 3, 3, 3, 3, 2]);

    // Level ke-1 harus memuat node terakhir yang dipromosikan apa adanya
    expect(levels[1]).toHaveLength(4);
    expect(toHex(levels[1][3])).toBe(toHex(leafHashes[6]));

    for (let index = 0; index < leafHashes.length; index++) {
      const path = await merkleAuditPath(leafHashes, index);
      expect(await verifyAuditPath(leafHashes[index], path, `0x${example.root}`)).toBe(true);
    }
  });

  it('level-by-level (implementasi PANDU) identik dengan MTH rekursif RFC 6962 untuk n = 1..17', async () => {
    const mthRfc = (list: Uint8Array[]): Uint8Array => {
      if (list.length === 1) return list[0];
      let k = 1;
      while (k * 2 < list.length) k *= 2;
      return sha256(new Uint8Array([0x01]), mthRfc(list.slice(0, k)), mthRfc(list.slice(k)));
    };

    for (let n = 1; n <= 17; n++) {
      const leaves = Array.from({ length: n }, (_, i) => sha256(new TextEncoder().encode(`d${i}`)));
      const levels = await buildMerkleLevels(leaves);
      expect(toHex(levels[levels.length - 1][0]), `n=${n}`).toBe(toHex(mthRfc(leaves)));
    }
  });
});

describe('Paket selective disclosure', () => {
  const leaves: MerkleLeaf[] = [
    { path: 'material', value: 'Semen Portland Tipe I', salt: '11'.repeat(32) },
    { path: 'supplier', value: 'PT Rahasia Tbk', salt: '22'.repeat(32) },
    { path: 'inspection.result', value: 'PASS', salt: '33'.repeat(32) },
  ];

  it('membuktikan leaf yang diungkap termasuk root, tanpa membuka leaf lain', async () => {
    const root = await computeMerkleRoot(leaves);
    const pkg = await buildDisclosurePackage(leaves, ['inspection.result']);
    expect(pkg.root).toBe(root);
    expect(pkg.disclosed).toHaveLength(1);
    expect(pkg.disclosed[0].path).toBe('inspection.result');
    // Leaf yang dirahasiakan tidak ikut dalam paket
    expect(JSON.stringify(pkg)).not.toContain('PT Rahasia Tbk');

    expect(await verifyDisclosurePackage(pkg, root)).toBe(true);
  });

  it('menolak paket yang dimanipulasi', async () => {
    const root = await computeMerkleRoot(leaves);
    const pkg = await buildDisclosurePackage(leaves, ['inspection.result']);
    const tampered = JSON.parse(JSON.stringify(pkg));
    tampered.disclosed[0].value = 'FAIL';
    expect(await verifyDisclosurePackage(tampered, root)).toBe(false);

    const wrongRoot = await computeMerkleRoot([...leaves, { path: 'batchRef', value: 'X', salt: '44'.repeat(32) }]);
    const pkg2 = await buildDisclosurePackage(leaves, ['inspection.result']);
    expect(await verifyDisclosurePackage(pkg2, wrongRoot)).toBe(false);
  });
});
