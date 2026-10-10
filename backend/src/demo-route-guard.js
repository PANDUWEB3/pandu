export function assertDemoRouteEnv(env = process.env) {
  if (env.NODE_ENV === 'production' && String(env.DEMO_ROUTES || '').trim().toLowerCase() === 'true') {
    throw new Error('DEMO_ROUTES tidak boleh aktif saat NODE_ENV=production.');
  }
}

export function areDemoRoutesEnabled(env = process.env) {
  assertDemoRouteEnv(env);
  return env.NODE_ENV !== 'production' && String(env.DEMO_ROUTES || '').trim().toLowerCase() === 'true';
}

/** Register demo-only handlers only when explicitly opted in outside production. */
export function registerDemoRoutes(env, register) {
  if (!areDemoRoutesEnabled(env)) return false;
  register();
  return true;
}
