import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMerkleLevels, canonicalMerkleLeaf, computeMerkleRoot, hashMerkleLeaf, merkleAuditPath, sortMerkleLeaves, verifyMerkleDisclosure } from '../src/merkle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(await readFile(path.resolve(here, '../../test-vectors/merkle-selective-disclosure-vectors.json'), 'utf8'));
const portability = JSON.parse(await readFile(path.resolve(here, '../../test-vectors/merkle-portability-vectors.json'), 'utf8'));

test('backend matches shared TypeScript Merkle leaf hashes, odd promotion, roots, and audit paths', () => {
  for (const example of vectors.cases) {
    const sorted = sortMerkleLeaves(example.leaves);
    assert.deepEqual(sorted.map((leaf) => leaf.path), example.sortedPaths);
    const hashes = sorted.map(hashMerkleLeaf);
    assert.deepEqual(hashes.map((hash) => hash.toString('hex')), example.leafHashes);
    const root = computeMerkleRoot(example.leaves);
    assert.equal(root, `0x${example.root}`);
    for (let index = 0; index < sorted.length; index++) {
      const auditPath = merkleAuditPath(hashes, index);
      assert.deepEqual(auditPath, example.auditPaths[sorted[index].path]);
      assert.equal(verifyMerkleDisclosure({ ...sorted[index], auditPath }, root), true);
    }
  }
});

test('Merkle canonical JSON vector, prefix bytes, and RFC 6962 odd promotion stay fixed', () => {
  const example = vectors.cases[0].leaves[0];
  assert.equal(canonicalMerkleLeaf(example), JSON.stringify({ path: example.path, salt: example.salt, value: example.value }));
  assert.equal(buildMerkleLevels(vectors.rfc6962Example.leafHashes.map((hex) => Buffer.from(hex, 'hex'))).at(-1)[0].toString('hex'), vectors.rfc6962Example.root);
});

test('rejects duplicate paths, decimal JS numbers and malformed salts', () => {
  const valid = { path: 'measurement.value', salt: 'ab'.repeat(32), value: '12.34' };
  assert.throws(() => sortMerkleLeaves([valid, valid]), /Duplicate Merkle path/);
  assert.throws(() => hashMerkleLeaf({ ...valid, value: 12.34 }), /safe integers/);
  assert.throws(() => hashMerkleLeaf({ ...valid, salt: 'ab' }), /32-byte hex salt/);
});

test('matches the shared UTF-8 path ordering and fixed-point vector', () => {
  assert.deepEqual(sortMerkleLeaves(portability.leaves).map((leaf) => leaf.path), portability.sortedPaths);
  assert.equal(computeMerkleRoot(portability.leaves), portability.root);
});
