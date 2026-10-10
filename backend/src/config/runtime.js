import { z } from 'zod';

const RuntimeEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  TRUST_PROXY: z.string().trim().optional(),
  RATE_LIMIT_FAIL_CLOSED: z.enum(['true', 'false']).optional(),
  REDIS_URL: z.string().url().refine((value) => /^rediss?:\/\//i.test(value), 'Expected redis:// or rediss://').optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  FRONTEND_ORIGIN: z.string().url().optional(),
  DEMO_ROUTES: z.enum(['true', 'false']).default('false'),
  PANDU_CHAIN: z.enum(['arbitrum-sepolia', 'arbitrum-one']).default('arbitrum-sepolia'),
  ARBITRUM_SEPOLIA_RPC_URL: z.string().url().optional(),
  ARBITRUM_ONE_RPC_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  PINATA_JWT: z.string().optional(),
  RELAYER_PRIVATE_KEY: z.string().optional(),
  PUBLIC_TOKEN_SECRET: z.string().min(32).optional(),
  RELAYER_MAX_GAS_LIMIT: z.coerce.number().int().positive().default(1500000),
  RELAYER_LOW_BALANCE_WEI: z.string().regex(/^\d+$/).default('50000000000000000'),
  RELAYER_TX_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  PANDU_REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  PANDU_LEGACY_REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
}).superRefine((env, context) => {
  if (env.NODE_ENV !== 'production') return;
  if (!env.TRUST_PROXY) context.addIssue({ code: 'custom', path: ['TRUST_PROXY'] });
  if (!env.REDIS_URL) context.addIssue({ code: 'custom', path: ['REDIS_URL'] });
  if (env.RATE_LIMIT_FAIL_CLOSED !== 'true') context.addIssue({ code: 'custom', path: ['RATE_LIMIT_FAIL_CLOSED'] });
  if (!env.CORS_ALLOWED_ORIGINS) context.addIssue({ code: 'custom', path: ['CORS_ALLOWED_ORIGINS'] });
  if (env.DEMO_ROUTES === 'true') context.addIssue({ code: 'custom', path: ['DEMO_ROUTES'] });
  if (!env.SUPABASE_URL || !(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY)) context.addIssue({ code: 'custom', path: ['SUPABASE_URL'] });
  if (!env.PINATA_JWT) context.addIssue({ code: 'custom', path: ['PINATA_JWT'] });
  if (!env.RELAYER_PRIVATE_KEY || !/^0x[0-9a-fA-F]{64}$/.test(env.RELAYER_PRIVATE_KEY)) context.addIssue({ code: 'custom', path: ['RELAYER_PRIVATE_KEY'] });
  if (!env.PANDU_REGISTRY_ADDRESS) context.addIssue({ code: 'custom', path: ['PANDU_REGISTRY_ADDRESS'] });
  if (!env.PUBLIC_TOKEN_SECRET || env.PUBLIC_TOKEN_SECRET.length < 32) context.addIssue({ code: 'custom', path: ['PUBLIC_TOKEN_SECRET'] });
});

/** Parse once at boot; report field names and codes only, never values. */
export function loadRuntimeConfig(env = process.env) {
  const result = RuntimeEnvSchema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => String(issue.path[0] || 'environment')))].sort();
    throw new Error(`Invalid runtime environment fields: ${fields.join(', ')}`);
  }
  return result.data;
}

export function getAllowedOrigins(config) {
  const configured = config.CORS_ALLOWED_ORIGINS
    ? config.CORS_ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
    : [config.FRONTEND_ORIGIN || 'http://localhost:5173', 'http://127.0.0.1:5173'];
  if (configured.length === 0) throw new Error('Invalid runtime environment fields: CORS_ALLOWED_ORIGINS');
  for (const origin of configured) {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('Invalid runtime environment fields: CORS_ALLOWED_ORIGINS');
    }
  }
  return new Set(configured);
}
