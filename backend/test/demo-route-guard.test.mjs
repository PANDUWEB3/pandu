import test from 'node:test';
import assert from 'node:assert/strict';
import { areDemoRoutesEnabled, registerDemoRoutes } from '../src/demo-route-guard.js';

test('demo routes are disabled by default and add no handlers without the opt-in flag', () => {
  let registered = false;
  assert.equal(areDemoRoutesEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(registerDemoRoutes({ NODE_ENV: 'development' }, () => { registered = true; }), false);
  assert.equal(registered, false);
});

test('demo routes require DEMO_ROUTES=true and are never enabled in production', () => {
  let registered = false;
  assert.equal(registerDemoRoutes({ NODE_ENV: 'test', DEMO_ROUTES: 'true' }, () => { registered = true; }), true);
  assert.equal(registered, true);
  assert.throws(() => areDemoRoutesEnabled({ NODE_ENV: 'production', DEMO_ROUTES: 'true' }), /tidak boleh aktif/);
  assert.throws(() => registerDemoRoutes({ NODE_ENV: 'production', DEMO_ROUTES: 'true' }, () => {}), /tidak boleh aktif/);
});
