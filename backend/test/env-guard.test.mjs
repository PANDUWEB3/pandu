import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionEnv, parseTrustProxy, resolveRateLimitFailClosed } from '../src/env-guard.js';

test('assertProductionEnv: lewati untuk NODE_ENV selain production', () => {
  assert.deepEqual(assertProductionEnv({ NODE_ENV: 'development' }), { ok: true, missing: [] });
  assert.deepEqual(assertProductionEnv({}), { ok: true, missing: [] });
});

test('assertProductionEnv: NODE_ENV=production tanpa TRUST_PROXY & REDIS_URL harus gagal', () => {
  assert.throws(
    () => assertProductionEnv({ NODE_ENV: 'production' }),
    (err) => {
      assert.match(err.message, /TRUST_PROXY/);
      assert.match(err.message, /REDIS_URL/);
      return true;
    }
  );
  assert.throws(() => assertProductionEnv({ NODE_ENV: 'production', TRUST_PROXY: '1' }), /REDIS_URL/);
  assert.throws(() => assertProductionEnv({ NODE_ENV: 'production', REDIS_URL: 'redis://x' }), /TRUST_PROXY/);
});

test('assertProductionEnv: NODE_ENV=production dengan TRUST_PROXY & REDIS_URL harus lolos', () => {
  assert.deepEqual(
    assertProductionEnv({ NODE_ENV: 'production', TRUST_PROXY: '1', REDIS_URL: 'redis://localhost:6379' }),
    { ok: true, missing: [] }
  );
  assert.deepEqual(
    assertProductionEnv({ NODE_ENV: 'production', TRUST_PROXY: 'false', REDIS_URL: 'redis://x', RATE_LIMIT_FAIL_CLOSED: 'false' }),
    { ok: true, missing: [] }
  );
});

test('resolveRateLimitFailClosed: default true saat NODE_ENV=production', () => {
  assert.equal(resolveRateLimitFailClosed({ NODE_ENV: 'production' }), true);
  assert.equal(resolveRateLimitFailClosed({ NODE_ENV: 'development' }), false);
  assert.equal(resolveRateLimitFailClosed({}), false);
});

test('resolveRateLimitFailClosed: nilai eksplisit menang atas default', () => {
  assert.equal(resolveRateLimitFailClosed({ NODE_ENV: 'production', RATE_LIMIT_FAIL_CLOSED: 'false' }), false);
  assert.equal(resolveRateLimitFailClosed({ NODE_ENV: 'production', RATE_LIMIT_FAIL_CLOSED: 'FALSE' }), false);
  assert.equal(resolveRateLimitFailClosed({ NODE_ENV: 'development', RATE_LIMIT_FAIL_CLOSED: 'true' }), true);
  assert.equal(resolveRateLimitFailClosed({ NODE_ENV: 'production', RATE_LIMIT_FAIL_CLOSED: '' }), true);
});

test('parseTrustProxy: konversi nilai TRUST_PROXY ke parameter Express', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('FALSE'), false);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('3'), 3);
  assert.equal(parseTrustProxy('loopback'), 'loopback');
  assert.equal(parseTrustProxy('10.0.0.0/8'), '10.0.0.0/8');
});
