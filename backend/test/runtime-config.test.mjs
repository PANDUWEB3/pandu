import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllowedOrigins, loadRuntimeConfig } from '../src/config/runtime.js';

test('runtime config has safe development defaults and parses explicit values', () => {
  const defaults = loadRuntimeConfig({});
  assert.equal(defaults.NODE_ENV, 'development');
  assert.equal(defaults.PORT, 8787);
  assert.equal(defaults.DEMO_ROUTES, 'false');
  assert.deepEqual([...getAllowedOrigins(defaults)], ['http://localhost:5173', 'http://127.0.0.1:5173']);
});

test('production requires explicit proxy, Redis fail-closed, CORS allowlist, and demo-off settings', () => {
  const base = {
    NODE_ENV: 'production', TRUST_PROXY: '1', REDIS_URL: 'rediss://redis.example:6380',
    RATE_LIMIT_FAIL_CLOSED: 'true', CORS_ALLOWED_ORIGINS: 'https://app.example',
    SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: 'test-only-secret-value',
    PINATA_JWT: 'test-only-pinata-token', RELAYER_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
    PANDU_REGISTRY_ADDRESS: `0x${'22'.repeat(20)}`, PUBLIC_TOKEN_SECRET: 'test-only-public-secret-value-32-bytes',
  };
  assert.equal(loadRuntimeConfig(base).NODE_ENV, 'production');
  assert.throws(() => loadRuntimeConfig({ ...base, RATE_LIMIT_FAIL_CLOSED: 'false' }), /RATE_LIMIT_FAIL_CLOSED/);
  assert.throws(() => loadRuntimeConfig({ ...base, DEMO_ROUTES: 'true' }), /DEMO_ROUTES/);
  assert.throws(() => loadRuntimeConfig({ ...base, TRUST_PROXY: undefined }), /TRUST_PROXY/);
  assert.throws(() => loadRuntimeConfig({ ...base, REDIS_URL: 'https://redis.example' }), /REDIS_URL/);
});

test('environment validation never includes secret input values in its error', () => {
  const marker = 'do-not-print-this-env-value';
  assert.throws(() => loadRuntimeConfig({ NODE_ENV: 'production', SUPABASE_URL: marker }), (error) => {
    assert.doesNotMatch(error.message, new RegExp(marker));
    return true;
  });
});

test('CORS origins reject credentials, paths, and wildcard configuration', () => {
  const config = loadRuntimeConfig({ CORS_ALLOWED_ORIGINS: 'https://app.example' });
  assert.throws(() => getAllowedOrigins({ ...config, CORS_ALLOWED_ORIGINS: 'https://user:pass@app.example' }), /CORS_ALLOWED_ORIGINS/);
  assert.throws(() => getAllowedOrigins({ ...config, CORS_ALLOWED_ORIGINS: 'https://app.example/path' }), /CORS_ALLOWED_ORIGINS/);
  assert.throws(() => getAllowedOrigins({ ...config, CORS_ALLOWED_ORIGINS: '*' }));
  assert.throws(() => getAllowedOrigins({ ...config, CORS_ALLOWED_ORIGINS: ', ,' }));
});
