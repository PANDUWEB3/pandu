import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

function targetFor(kind, env) {
  if (kind === 'supabase') {
    try {
      const host = new URL(env.SUPABASE_URL).hostname;
      const projectRef = host.split('.')[0];
      return { label: `Supabase project ${projectRef}`, configured: Boolean(projectRef) };
    } catch {
      return { label: 'Supabase project (not configured)', configured: false };
    }
  }
  const mainnet = env.PANDU_CHAIN === 'arbitrum-one' || kind === 'mainnet';
  return {
    label: mainnet ? 'Arbitrum One mainnet (42161)' : 'Arbitrum Sepolia testnet (421614)',
    configured: true,
    mainnet,
  };
}

function optionValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

/**
 * Every script in this folder exits before any mutation unless explicitly authorized.
 * Destructive operations require a target-matched, checksum-verified external backup.
 */
export async function guardDangerScript({ scriptName, kind, destructive = false, env = process.env, argv = process.argv.slice(2) }) {
  const target = targetFor(kind, env);
  if (!argv.includes('--execute')) {
    console.info(`DRY-RUN: ${scriptName} target=${target.label}; no external changes or transactions were attempted.`);
    return false;
  }
  if (!target.configured) {
    console.error(`Refusing ${scriptName}: target configuration is missing.`);
    process.exitCode = 2;
    return false;
  }
  if (target.mainnet) {
    if (env.NODE_ENV !== 'production') {
      console.error(`Refusing ${scriptName}: mainnet actions require NODE_ENV=production.`);
      process.exitCode = 2;
      return false;
    }
    if (!argv.includes('--i-understand-this-is-mainnet')) {
      console.error(`Refusing ${scriptName}: add --i-understand-this-is-mainnet to acknowledge the target.`);
      process.exitCode = 2;
      return false;
    }
  }
  if (destructive) {
    const backupPath = optionValue(argv, '--backup-file');
    const backupHash = optionValue(argv, '--backup-sha256');
    const backupTarget = optionValue(argv, '--backup-target');
    if (!backupPath || !/^[0-9a-f]{64}$/i.test(backupHash || '') || backupTarget !== target.label) {
      console.error(`Refusing ${scriptName}: provide a verified backup file, SHA-256, and exact backup target (${target.label}).`);
      process.exitCode = 2;
      return false;
    }
    try {
      const actual = createHash('sha256').update(await readFile(backupPath)).digest('hex');
      if (actual.toLowerCase() !== backupHash.toLowerCase()) throw new Error('checksum mismatch');
    } catch {
      console.error(`Refusing ${scriptName}: backup could not be verified for ${target.label}.`);
      process.exitCode = 2;
      return false;
    }
  }
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error(`Refusing ${scriptName}: interactive target confirmation is required (${target.label}).`);
    process.exitCode = 2;
    return false;
  }
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await prompt.question(`Type exactly "${target.label}" to execute ${scriptName}: `);
    if (answer !== target.label) {
      console.error('Confirmation did not match; no changes were attempted.');
      process.exitCode = 2;
      return false;
    }
  } finally {
    prompt.close();
  }
  return true;
}
