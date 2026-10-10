import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, REDIS_LUA_RATELIMIT } from '../src/rate-limiter.js';

test('RateLimiter In-Memory: pembatasan limit dan pembersihan TTL', async () => {
  const limiter = new RateLimiter({ failClosed: false });
  const key = `user-test-${Date.now()}`;

  // Limit 3 request per window
  assert.equal(await limiter.check(key, 3, 1000), true, 'Request 1 harus diizinkan');
  assert.equal(await limiter.check(key, 3, 1000), true, 'Request 2 harus diizinkan');
  assert.equal(await limiter.check(key, 3, 1000), true, 'Request 3 harus diizinkan');
  assert.equal(await limiter.check(key, 3, 1000), false, 'Request 4 harus ditolak (rate limited)');
});

test('RateLimiter Redis Lua Script: mengeksekusi script atomik', async () => {
  let executedScript = null;
  let executedArgs = null;
  let callCount = 0;

  const mockRedis = {
    status: 'ready',
    eval: async (script, numKeys, key, limit, windowMs) => {
      executedScript = script;
      executedArgs = { numKeys, key, limit, windowMs };
      callCount += 1;
      return callCount; // simulates INCR count
    },
  };

  const limiter = new RateLimiter({ redis: mockRedis, failClosed: true });
  const allowed1 = await limiter.check('wallet:0x123', 2, 60000);
  assert.equal(allowed1, true, 'Request 1 harus lolos via Redis Lua');
  assert.ok(executedScript.includes('PEXPIRE'), 'Script Lua harus memuat instruksi PEXPIRE atomik');
  assert.equal(executedArgs.key, 'pandu:rl:wallet:0x123');
  assert.equal(executedArgs.limit, 2);

  const allowed2 = await limiter.check('wallet:0x123', 2, 60000);
  assert.equal(allowed2, true, 'Request 2 harus lolos');

  const allowed3 = await limiter.check('wallet:0x123', 2, 60000);
  assert.equal(allowed3, false, 'Request 3 harus ditolak oleh Redis limiter');
});

test('RateLimiter RATE_LIMIT_FAIL_CLOSED=true: tolak request saat Redis error', async () => {
  const failingRedis = {
    status: 'ready',
    eval: async () => {
      throw new Error('Connection refused to Redis cluster');
    },
  };

  const failClosedLimiter = new RateLimiter({ redis: failingRedis, failClosed: true });
  const result = await failClosedLimiter.check('wallet:critical', 10, 60000);
  assert.equal(result, false, 'Harus tolak request jika RATE_LIMIT_FAIL_CLOSED aktif dan Redis gagal');
});

test('RateLimiter RATE_LIMIT_FAIL_CLOSED=false: fallback ke memory saat Redis error', async () => {
  const failingRedis = {
    status: 'ready',
    eval: async () => {
      throw new Error('Connection refused to Redis cluster');
    },
  };

  const fallbackLimiter = new RateLimiter({ redis: failingRedis, failClosed: false });
  const result = await fallbackLimiter.check('wallet:fallback', 10, 60000);
  assert.equal(result, true, 'Harus fallback ke in-memory jika RATE_LIMIT_FAIL_CLOSED tidak aktif');
});

test('RateLimiter: default fail-closed TRUE saat NODE_ENV=production', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevFailClosed = process.env.RATE_LIMIT_FAIL_CLOSED;
  delete process.env.RATE_LIMIT_FAIL_CLOSED;
  process.env.NODE_ENV = 'production';
  try {
    const failingRedis = { status: 'ready', eval: async () => { throw new Error('Redis down'); } };
    const limiter = new RateLimiter({ redis: failingRedis });
    assert.equal(limiter.failClosed, true, 'NODE_ENV=production harus mengaktifkan fail-closed secara default');
    assert.equal(
      await limiter.check('anchor:prod', 10, 60000),
      false,
      'Harus menolak request ketika Redis gagal di produksi (fail-closed)'
    );
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevFailClosed === undefined) delete process.env.RATE_LIMIT_FAIL_CLOSED;
    else process.env.RATE_LIMIT_FAIL_CLOSED = prevFailClosed;
  }
});
