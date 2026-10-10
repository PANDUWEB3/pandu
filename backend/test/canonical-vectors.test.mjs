import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, computeCanonicalEvidenceHash } from '../src/canonical.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testVectorsPath = path.resolve(__dirname, '../../test-vectors/canonical-proof-vectors.json');

test('Paritas Test Vector Bersama: canonicalJson & computeCanonicalEvidenceHash (Backend node:test)', async () => {
  const fileContent = await readFile(testVectorsPath, 'utf8');
  const vectors = JSON.parse(fileContent);

  assert.ok(vectors.length > 0, 'Test vectors harus memuat minimal 1 kasus uji');

  for (const [index, vector] of vectors.entries()) {
    const computedJson = canonicalJson(vector.input);
    assert.equal(
      computedJson,
      vector.expectedCanonicalJson,
      `[Vector ${index + 1}: ${vector.description}] canonicalJson harus identik dengan test vector`
    );

    const computedHash = computeCanonicalEvidenceHash(vector.input);
    assert.equal(
      computedHash.toLowerCase(),
      vector.expectedEvidenceHash.toLowerCase(),
      `[Vector ${index + 1}: ${vector.description}] evidenceHash harus identik dengan test vector`
    );
  }
});
