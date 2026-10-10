import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync(new URL('../src/Workspace.tsx', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../src/landing/Verify.tsx', import.meta.url), 'utf8');

describe('raw browser secrets are memory-only', () => {
  it('does not read or write a recovery passphrase in web storage', () => {
    expect(workspace).not.toMatch(/(?:local|session)Storage\.(?:getItem|setItem)\(['"]PANDU\.recovery-passphrase/);
    expect(workspace).toContain('recoveryPassphraseSession');
  });

  it('does not read or write verifier private keys in web storage', () => {
    expect(verifier).not.toMatch(/(?:local|session)Storage\.(?:getItem|setItem)\([^)]*(?:verifier|privateKey)/i);
    expect(verifier).toContain('verifierPrivateKeyHex');
  });
});
