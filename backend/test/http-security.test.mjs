import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createHttpSecurity } from '../src/middleware/http-security.js';
import { errorHandler } from '../src/middleware/error-handler.js';

test('HTTP security middleware applies strict CSP and only reflects allowed origins', async (context) => {
  const app = express();
  app.use(...createHttpSecurity({ allowedOrigins: new Set(['https://app.example']), production: true }));
  app.get('/probe', (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${server.address().port}/probe`;

  const allowed = await fetch(url, { headers: { Origin: 'https://app.example' } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://app.example');
  assert.match(allowed.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff');

  const denied = await fetch(url, { headers: { Origin: 'https://attacker.example' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(await denied.json(), { error: 'ORIGIN_DENIED' });
});
