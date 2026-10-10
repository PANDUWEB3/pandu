import { describe, expect, it, vi } from 'vitest';
import { verifyProofOnchain } from '../src/onchain-verification';

const metadata = {
  proofId: `0x${'11'.repeat(32)}`,
  chainId: 421614,
  contractAddress: '0x2e6aE365874D3b06dA896980D1CFc817Be873EE9',
  commitment: `0x${'22'.repeat(32)}`,
  legacy: false,
};
const config = {
  rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
  chainId: 421614,
  registryAddress: metadata.contractAddress,
};

function deps(overrides: Partial<{ valid: boolean; verified: boolean; revoked: boolean; evidenceHash: string }> = {}) {
  const calls = { getProof: vi.fn(), isValid: vi.fn(), verify: vi.fn() };
  calls.getProof.mockResolvedValue({
    evidenceHash: overrides.evidenceHash || metadata.commitment,
    revoked: overrides.revoked || false,
    timestamp: 123,
    attester: '0x0000000000000000000000000000000000000001',
    relayer: '0x0000000000000000000000000000000000000002',
  });
  calls.isValid.mockResolvedValue(overrides.valid ?? true);
  calls.verify.mockResolvedValue(overrides.verified ?? true);
  return {
    calls,
    providerFactory: vi.fn(() => ({ getNetwork: async () => ({ chainId: 421614n }) })),
    contractFactory: vi.fn(() => calls),
  };
}

describe('verifyProofOnchain', () => {
  it('reads getProof, isValid and verify and accepts only matching chain commitment', async () => {
    const d = deps();
    const result = await verifyProofOnchain(metadata, config, d);
    expect(d.calls.getProof).toHaveBeenCalledWith(metadata.proofId);
    expect(d.calls.isValid).toHaveBeenCalledWith(metadata.proofId);
    expect(d.calls.verify).toHaveBeenCalledWith(metadata.proofId, metadata.commitment);
    expect(result).toMatchObject({ status: 'VERIFIED', commitmentMatches: true, verify: true, isValid: true });
  });

  it('fails closed on a mismatch, revoked proof or invalid proof', async () => {
    expect((await verifyProofOnchain(metadata, config, deps({ verified: false }))).status).toBe('MISMATCH');
    expect((await verifyProofOnchain(metadata, config, deps({ valid: false }))).status).toBe('MISMATCH');
    expect((await verifyProofOnchain(metadata, config, deps({ revoked: true }))).status).toBe('REVOKED');
  });

  it('marks v1 as legacy and explicitly does not claim issuer signature verification', async () => {
    const legacy = { ...metadata, legacy: true, contractAddress: '0x0000000000000000000000000000000000000003' };
    const d = deps();
    const result = await verifyProofOnchain(legacy, { ...config, legacyRegistryAddress: legacy.contractAddress }, d);
    expect(result).toMatchObject({ status: 'LEGACY_UNSIGNED', issuerSignature: 'not-checked-legacy', verify: null });
    expect(d.calls.isValid).not.toHaveBeenCalled();
    expect(d.calls.verify).not.toHaveBeenCalled();
  });

  it('rejects chain and registry configuration mismatches', async () => {
    await expect(verifyProofOnchain(metadata, { ...config, chainId: 1 }, deps())).rejects.toThrow(/Chain ID/);
    await expect(verifyProofOnchain(metadata, { ...config, registryAddress: '0x0000000000000000000000000000000000000003' }, deps())).rejects.toThrow(/Alamat registry/);
  });
});
