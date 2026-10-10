import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createCiphertextRouter, CIPHERTEXT_MIME, MAX_CIPHERTEXT_BYTES } from '../src/ciphertext-router.js';
import { webcrypto } from 'node:crypto';

test('local ciphertext upload, fetch, and decrypt roundtrip ignores supplied MIME', async (t) => {
  const objects = new Map();
  const storage = {
    async put(bytes) { const cid = `bafy${String(objects.size).padStart(20, '0')}`; objects.set(cid, Buffer.from(bytes)); return cid; },
    async get(cid) { return objects.get(cid) || null; },
  };
  const app = express();
  app.use('/api/evidence', createCiphertextRouter({ storage, requireAuth: (_req, _res, next) => next() }));
  app.use((error, _req, res, _next) => res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/evidence`;

  const plaintext = new TextEncoder().encode('ciphertext integration fixture');
  const keyBytes = webcrypto.getRandomValues(new Uint8Array(32));
  const key = await webcrypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const payload = new Uint8Array(iv.length + encrypted.length);
  payload.set(iv); payload.set(encrypted, iv.length);

  const form = new FormData();
  form.append('file', new Blob([payload], { type: 'image/png' }), 'opaque-proof.enc');
  const uploadResponse = await fetch(baseUrl, { method: 'POST', body: form });
  assert.equal(uploadResponse.status, 201);
  const upload = await uploadResponse.json();
  assert.equal(upload.mimeType, CIPHERTEXT_MIME);
  assert.equal(upload.byteSize, payload.length);

  const downloadResponse = await fetch(`${baseUrl}/${upload.cid}`);
  assert.equal(downloadResponse.status, 200);
  assert.equal(downloadResponse.headers.get('content-type'), CIPHERTEXT_MIME);
  const fetched = new Uint8Array(await downloadResponse.arrayBuffer());
  const decrypted = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: fetched.slice(0, 12) }, key, fetched.slice(12));
  assert.deepEqual(new Uint8Array(decrypted), plaintext);
});

test('ciphertext upload rejects non-.enc names and enforces the 10 MiB maximum', async (t) => {
  const app = express();
  app.use('/api/evidence', createCiphertextRouter({ storage: { put: async () => 'bafy00000000000000000000', get: async () => null } }));
  app.use((error, _req, res, _next) => res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.message }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/evidence`;

  const wrongName = new FormData();
  wrongName.append('file', new Blob([new Uint8Array(32)], { type: CIPHERTEXT_MIME }), 'report.pdf');
  assert.equal((await fetch(baseUrl, { method: 'POST', body: wrongName })).status, 400);

  const tooLarge = new FormData();
  tooLarge.append('file', new Blob([new Uint8Array(MAX_CIPHERTEXT_BYTES + 1)], { type: CIPHERTEXT_MIME }), 'large.enc');
  assert.equal((await fetch(baseUrl, { method: 'POST', body: tooLarge })).status, 413);
});
