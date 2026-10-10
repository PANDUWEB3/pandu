/**
 * PANDU Production Environment Guard
 *
 * Aturan deployment (documentation/PANDU_Deployment_Runbook_v1.0.md):
 * - NODE_ENV=production WAJIB menyetel TRUST_PROXY (nilai Express: angka hop / true / false)
 *   dan REDIS_URL (rate limiter terdistribusi). Tanpa keduanya, rate limiter per-instance
 *   tidak mencerminkan klien asli dan gagal terkoordinasi antar instance.
 * - RATE_LIMIT_FAIL_CLOSED=true harus dinyatakan eksplisit saat NODE_ENV=production.
 */

/** Default fail-closed: produksi = true, selain itu = false (kecuali di-set eksplisit). */
export function resolveRateLimitFailClosed(env = process.env) {
  const explicit = env.RATE_LIMIT_FAIL_CLOSED;
  if (explicit !== undefined && explicit !== '') {
    return String(explicit).trim().toLowerCase() === 'true';
  }
  return env.NODE_ENV === 'production';
}

/**
 * Validasi wajib untuk produksi. Melempar Error jika TRUST_PROXY / REDIS_URL hilang
 * ketika NODE_ENV=production. Tidak melakukan apa pun pada environment lain.
 */
export function assertProductionEnv(env = process.env) {
  if (env.NODE_ENV !== 'production') return { ok: true, missing: [] };
  const missing = [];
  if (env.TRUST_PROXY === undefined || String(env.TRUST_PROXY).trim() === '') missing.push('TRUST_PROXY');
  if (env.REDIS_URL === undefined || String(env.REDIS_URL).trim() === '') missing.push('REDIS_URL');
  if (String(env.RATE_LIMIT_FAIL_CLOSED || '').trim().toLowerCase() !== 'true') missing.push('RATE_LIMIT_FAIL_CLOSED=true');
  if (env.CORS_ALLOWED_ORIGINS === undefined || String(env.CORS_ALLOWED_ORIGINS).trim() === '') missing.push('CORS_ALLOWED_ORIGINS');
  if (String(env.DEMO_ROUTES || '').trim().toLowerCase() === 'true') missing.push('DEMO_ROUTES must be false');
  if (missing.length) {
    throw new Error(
      `Konfigurasi produksi tidak lengkap. Wajib menyetel: ${missing.join(', ')}. ` +
        `Lihat documentation/PANDU_Deployment_Runbook_v1.0.md.`
    );
  }
  return { ok: true, missing: [] };
}

/** Parsing nilai TRUST_PROXY menjadi parameter Express `trust proxy`. */
export function parseTrustProxy(value) {
  if (value === undefined || value === null || String(value).trim() === '') return false;
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (!Number.isNaN(Number(raw))) return Number(raw);
  return raw; // nama hop / daftar koma / IP / subnet sesuai dokumentasi Express
}
