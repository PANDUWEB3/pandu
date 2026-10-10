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
        console.log('[RateLimiter] Terhubung ke Redis untuk rate limiting terdistribusi.');
      } catch (err) {
        console.warn('[RateLimiter] Gagal koneksi Redis, fallback ke in-memory lokal:', err.message);
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
        } catch (err) {
          console.warn('[RateLimiter] Redis exec error:', err.message);
          if (isFailClosed) {
            console.warn('[RateLimiter] RATE_LIMIT_FAIL_CLOSED aktif: menolak request akibat kegagalan Redis.');
            return false;
          }
        }
      } else {
        if (isFailClosed) {
          console.warn(`[RateLimiter] RATE_LIMIT_FAIL_CLOSED aktif: Redis status=${this.redis.status}, menolak request.`);
          return false;
        }
      }
    } else if (process.env.REDIS_URL && isFailClosed) {
      console.warn('[RateLimiter] RATE_LIMIT_FAIL_CLOSED aktif: instance Redis tidak terhubung, menolak request.');
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
