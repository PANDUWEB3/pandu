import { describe, expect, it } from 'vitest';
import { createEncryptedProofCommitment, openEncryptedProofCommitment } from '../src/proof-commitment';
import type { MerkleLeaf } from '../src/merkle';

const leaves: MerkleLeaf[] = [
  { path: 'inspection.result', value: 'PASS', salt: '11'.repeat(32) },
  { path: 'measurement.moisture', value: '12.30', salt: '22'.repeat(32) },
];

describe('private Merkle bundle per proof', () => {
  it('stores only ciphertext and opens locally with the proof owner wallet KEK', async () => {
    const walletKek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const created = await createEncryptedProofCommitment({
      organizationId: 'org-1', proofRowId: 'row-1', publicId: 'PANDU-0123456789ABCDEF', leaves,
      walletKek, walletAccount: '0x0000000000000000000000000000000000000001', recoveryPassphrase: 'pandu-proof-recovery-2026',
    });
    expect(created.root).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify(created.privateEnvelope)).not.toContain('12.30');
    expect(JSON.stringify(created.privateEnvelope)).not.toContain('11'.repeat(32));
    const opened = await openEncryptedProofCommitment({
      organizationId: 'org-1', proofRowId: 'row-1', envelope: created.privateEnvelope, walletKek,
      walletAccount: '0x0000000000000000000000000000000000000001',
    });
    expect(opened.root).toBe(created.root);
    expect(opened.leaves).toEqual(leaves);
  });

  it('binds private proof ciphertext to row and wallet identity', async () => {
    const walletKek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const created = await createEncryptedProofCommitment({
      organizationId: 'org-1', proofRowId: 'row-1', publicId: 'PANDU-0123456789ABCDEF', leaves,
      walletKek, walletAccount: '0x0000000000000000000000000000000000000001', recoveryPassphrase: 'pandu-proof-recovery-2026',
    });
    await expect(openEncryptedProofCommitment({
      organizationId: 'org-1', proofRowId: 'row-2', envelope: created.privateEnvelope, walletKek,
      walletAccount: '0x0000000000000000000000000000000000000001',
    })).rejects.toThrow();
    await expect(openEncryptedProofCommitment({
      organizationId: 'org-1', proofRowId: 'row-1', envelope: created.privateEnvelope, walletKek,
      walletAccount: '0x0000000000000000000000000000000000000002',
    })).rejects.toThrow(/unavailable/);
  });
});
