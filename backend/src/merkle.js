import { createHash } from 'node:crypto';

export const MERKLE_LEAF_PREFIX = 0x00;
export const MERKLE_NODE_PREFIX = 0x01;
export const MERKLE_VERSION = 'pandu-merkle-v1';

const utf8 = (value) => Buffer.from(value, 'utf8');
function compareUtf8(left, right) { return Buffer.compare(utf8(left), utf8(right)); }

function canonicalValue(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('Merkle numeric values must be safe integers; encode fixed-point decimals as strings.');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value).sort(compareUtf8);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(',')}}`;
  }
  throw new Error('Merkle leaf value must be canonical JSON.');
}

export function canonicalMerkleLeaf(leaf) {
  if (!leaf || typeof leaf.path !== 'string' || !leaf.path || !/^[0-9a-fA-F]{64}$/.test(leaf.salt || '')) {
    throw new Error('Merkle leaf requires a non-empty path and 32-byte hex salt.');
  }
  if (Buffer.from(leaf.path, 'utf8').toString('utf8') !== leaf.path) throw new Error('Merkle path must be valid UTF-8.');
  return `{"path":${JSON.stringify(leaf.path)},"salt":${JSON.stringify(leaf.salt)},"value":${canonicalValue(leaf.value)}}`;
}

export function hashMerkleLeaf(leaf) {
  return createHash('sha256').update(Buffer.from([MERKLE_LEAF_PREFIX])).update(canonicalMerkleLeaf(leaf), 'utf8').digest();
}

export function hashMerkleNode(left, right) {
  if (left.length !== 32 || right.length !== 32) throw new Error('Merkle node children must be 32-byte hashes.');
  return createHash('sha256').update(Buffer.from([MERKLE_NODE_PREFIX])).update(left).update(right).digest();
}

export function sortMerkleLeaves(leaves) {
  const sorted = [...leaves].sort((a, b) => compareUtf8(a.path, b.path));
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index - 1].path === sorted[index].path) throw new Error(`Duplicate Merkle path: ${sorted[index].path}`);
  }
  return sorted;
}

export function buildMerkleLevels(leafHashes) {
  if (!Array.isArray(leafHashes) || leafHashes.length === 0) throw new Error('Merkle tree needs at least one leaf.');
  if (leafHashes.some((hash) => hash.length !== 32)) throw new Error('Merkle leaf hashes must be 32 bytes.');
  const levels = [leafHashes];
  while (levels.at(-1).length > 1) {
    const current = levels.at(-1);
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(index + 1 < current.length ? hashMerkleNode(current[index], current[index + 1]) : current[index]);
    }
    levels.push(next);
  }
  return levels;
}

export function computeMerkleRoot(leaves) {
  const sorted = sortMerkleLeaves(leaves);
  const root = buildMerkleLevels(sorted.map(hashMerkleLeaf)).at(-1)[0];
  return `0x${root.toString('hex')}`;
}

export function merkleAuditPath(leafHashes, leafIndex) {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= leafHashes.length) throw new Error('Merkle leaf index out of range.');
  const levels = buildMerkleLevels(leafHashes);
  const path = [];
  let index = leafIndex;
  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex++) {
    const level = levels[levelIndex];
    const promoted = level.length % 2 === 1 && index === level.length - 1;
    if (!promoted) {
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      path.push({ sibling: level[siblingIndex].toString('hex'), isRight: siblingIndex > index });
    }
    index = Math.floor(index / 2);
  }
  return path;
}

export function verifyMerkleDisclosure(item, expectedRoot) {
  let current = hashMerkleLeaf(item);
  for (const step of item.auditPath) {
    if (typeof step.sibling !== 'string' || !/^[0-9a-fA-F]{64}$/.test(step.sibling) || typeof step.isRight !== 'boolean') return false;
    const sibling = Buffer.from(step.sibling, 'hex');
    current = step.isRight ? hashMerkleNode(current, sibling) : hashMerkleNode(sibling, current);
  }
  return `0x${current.toString('hex')}`.toLowerCase() === expectedRoot.toLowerCase();
}
