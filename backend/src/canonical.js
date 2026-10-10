import { createHash } from 'node:crypto';

/**
 * Serialisasi JSON kanonikal deterministik dengan pengurutan alfabetis keys
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const sortedKeys = Object.keys(value).sort();
  return `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/**
 * Hitung SHA-256 hex string dari Buffer/Uint8Array/string
 */
export function sha256Hex(value) {
  return createHash('sha256').update(Buffer.from(value)).digest('hex');
}

/**
 * Hitung evidenceHash kanonikal (0x-prefixed SHA-256 dari canonicalJson)
 */
export function computeCanonicalEvidenceHash(snapshot) {
  return `0x${sha256Hex(canonicalJson(snapshot))}`;
}
