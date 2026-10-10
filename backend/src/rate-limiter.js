/**
 * PANDU Distributed & In-Memory Rate Limiter
 * - Atomik via Redis Lua Script: INCR + PEXPIRE menjamin TTL selalu terpasang
 * - RATE_LIMIT_FAIL_CLOSED: Menolak request jika Redis down (keamanan relayer on-chain)
 * - In-Memory Fallback dengan TTL cleanup interval 30 detik
 */

import { resolveRateLimitFailClosed } from './env-guard.js';

export const REDIS_LUA_RATELIMIT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('PEXPIRE', key, windowMs)
else
  local ttl = redis.call('PTTL', key)
  if ttl == -1 then
    redis.call('PEXPIRE', key, windowMs)
  end
end

return current
`;

export class RateLimiter {
  constructor(options = {}) {
    this.memoryMap = new Map();
    this.redis = options.redis || null;
    // Default: RATE_LIMIT_FAIL_CLOSED=true saat NODE_ENV=production, false selain itu.
    this.failClosed = options.failClosed !== undefined ? options.failClosed : resolveRateLimitFailClosed();
    this.initCleanup();
    if (!options.redis && process.env.REDIS_URL) {
      this.initRedis();
    }
  }

  initCleanup() {
    // TTL Cleanup: timer periodik membersihkan entri kedaluwarsa tanpa memblokir event loop
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryMap.entries()) {
        if (now > entry.resetAt) {
          this.memoryMap.delete(key);
        }
      }
    }, 30_000);
    timer.unref();
  }

  async initRedis() {
    if (process.env.REDIS_URL) {
      try {
        const { default: Redis } = await import('ioredis');
        this.redis = new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
        });
        await this.redis.connect();
        console.info(JSON.stringify({ level: 'info', event: 'redis_connected', component: 'rate_limiter' }));
      } catch {
        console.warn(JSON.stringify({ level: 'warn', event: 'redis_unavailable', component: 'rate_limiter' }));
        this.redis = null;
      }
    }
  }

  async check(key, limit = 10, windowMs = 60_000) {
    const isFailClosed = this.failClosed;

    // Jika redis aktif dan siap
    if (this.redis) {
      if (this.redis.status === 'ready' || typeof this.redis.eval === 'function') {
        try {
          const redisKey = `pandu:rl:${key}`;
          const count = Number(await this.redis.eval(REDIS_LUA_RATELIMIT, 1, redisKey, limit, windowMs));
          return count <= limit;
        } catch {
          console.warn(JSON.stringify({ level: 'warn', event: 'redis_request_failed', component: 'rate_limiter' }));
          if (isFailClosed) {
            console.warn(JSON.stringify({ level: 'warn', event: 'rate_limit_rejected', reason: 'redis_failure' }));
            return false;
          }
        }
      } else {
        if (isFailClosed) {
          console.warn(JSON.stringify({ level: 'warn', event: 'rate_limit_rejected', reason: 'redis_not_ready' }));
          return false;
        }
      }
    } else if (process.env.REDIS_URL && isFailClosed) {
      console.warn(JSON.stringify({ level: 'warn', event: 'rate_limit_rejected', reason: 'redis_unavailable' }));
      return false;
    }

    // Fallback ke in-memory jika Redis tidak digunakan atau fail-closed tidak aktif
    const now = Date.now();
    const entry = this.memoryMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    this.memoryMap.set(key, entry);
    return entry.count <= limit;
  }
}
