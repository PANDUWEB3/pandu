import test from 'node:test';
import assert from 'node:assert/strict';
import { hashGoogleSubject } from '../src/security/identity-hash.js';
import { validateCiphertextEnvelopeShape } from '../src/security/db-envelope.js';

test('Google subject uses a dedicated keyed HMAC and does not equal an unkeyed hash', () => {
  const pepper = 'test-only-pepper-value-with-at-least-32-bytes';
  const digest = hashGoogleSubject('google-subject-sample', pepper);
  assert.equal(digest.length, 32);
  assert.notDeepEqual(digest, hashGoogleSubject('google-subject-sample', `${pepper}!`));
  assert.throws(() => hashGoogleSubject('google-subject-sample', 'short'));
});

test('backend envelope validation checks only ciphertext shape', () => {
  const envelope = { v: 1, alg: 'A256GCM', kid: 'org-v1', iv: 'AAAAAAAAAAAAAAAA', data: 'A'.repeat(24), aad: '{"column":"notes"}' };
  assert.equal(validateCiphertextEnvelopeShape(envelope).success, true);
  assert.equal(validateCiphertextEnvelopeShape({ ...envelope, plaintext: 'sample' }).success, false);
  assert.equal(validateCiphertextEnvelopeShape({ ...envelope, v: 2 }).success, false);
});
