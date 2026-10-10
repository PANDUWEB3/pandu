import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dangerousScripts = [
  'apply-migration.mjs', 'run-sql-direct.mjs', 'push-fix-migration.mjs',
  'migrate-cleanup-storage.mjs', 'deploy-testnet.mjs', 'deploy-arbitrum-one.mjs',
];

function runScript(name, extraArgs = [], nodeEnv = 'test') {
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: nodeEnv,
    SUPABASE_URL: 'https://fixture-project.supabase.co',
    PANDU_CHAIN: 'arbitrum-sepolia',
  };
  return spawnSync(process.execPath, [path.join(backendDir, 'scripts', 'danger', name), ...extraArgs], {
    cwd: backendDir, env, encoding: 'utf8', timeout: 5000,
  });
}

test('all quarantined scripts default to dry-run and exit before external effects', () => {
  for (const name of dangerousScripts) {
    assert.equal(existsSync(path.join(backendDir, 'scripts', 'danger', name)), true, `${name} is quarantined`);
    const result = runScript(name);
    assert.equal(result.status, 0, `${name} exits cleanly without --execute`);
    assert.match(result.stdout, /DRY-RUN/);
    assert.match(result.stdout, /no external changes or transactions were attempted/);
    assert.doesNotMatch(result.stdout + result.stderr, /Bearer\s|Applied:|Deleting object|deployTransaction/i);
  }
});

test('mainnet script refuses execution outside production and without explicit acknowledgement', () => {
  const outsideProduction = runScript('deploy-arbitrum-one.mjs', ['--execute', '--i-understand-this-is-mainnet'], 'test');
  assert.equal(outsideProduction.status, 2);
  assert.match(outsideProduction.stderr, /NODE_ENV=production/);

  const noAcknowledgement = runScript('deploy-arbitrum-one.mjs', ['--execute'], 'production');
  assert.equal(noAcknowledgement.status, 2);
  assert.match(noAcknowledgement.stderr, /--i-understand-this-is-mainnet/);
});
