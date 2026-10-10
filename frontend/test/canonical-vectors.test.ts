import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, computeCanonicalEvidenceHash } from '../src/crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testVectorsPath = path.resolve(__dirname, '../../test-vectors/canonical-proof-vectors.json');

describe('Paritas Test Vector Bersama: canonicalJson & computeCanonicalEvidenceHash (Frontend vitest)', () => {
  const fileContent = readFileSync(testVectorsPath, 'utf8');
  const vectors = JSON.parse(fileContent);

  it('memuat setidaknya satu kasus uji dari file test vector', () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  vectors.forEach((vector: any, index: number) => {
    it(`[Vector ${index + 1}] ${vector.description}`, async () => {
      // 1. Uji canonicalJson deterministik
      const computedJson = canonicalJson(vector.input);
      expect(computedJson).toBe(vector.expectedCanonicalJson);

      // 2. Uji computeCanonicalEvidenceHash (SHA-256)
      const computedHash = await computeCanonicalEvidenceHash(vector.input);
      expect(computedHash.toLowerCase()).toBe(vector.expectedEvidenceHash.toLowerCase());
    });
  });
});
