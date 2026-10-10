import test from 'node:test';
import assert from 'node:assert/strict';
import { publicProofMetadata } from '../src/public-proof-metadata.js';

test('public proof metadata excludes all business snapshot fields', () => {
  const result = publicProofMetadata({
    anchor_status: 'confirmed', chain_id: 421614,
    contract_address: '0x0000000000000000000000000000000000000001',
    commitment: Buffer.alloc(32, 0xab), transaction_hash: '0xtx',
    merkle_version: 'pandu-merkle-v1', disclosed_paths: ['inspection.result'],
    public_snapshot: { supplier: 'private supplier', measurements: [123], evidence: ['private CID'] },
    organization_id: 'private organization', inspection_id: 'private inspection', original_name: 'private.pdf',
  }, { proofId: `0x${'11'.repeat(32)}`, legacy: false });

  assert.deepEqual(Object.keys(result).sort(), [
    'anchoredAt', 'attester', 'chainId', 'commitment', 'contractAddress', 'legacy',
    'proofId', 'revoked', 'status', 'transactionHash', 'merkleVersion', 'disclosedPaths',
  ].sort());
  assert.equal(result.commitment, `0x${'ab'.repeat(32)}`);
  assert.equal(result.merkleVersion, 'pandu-merkle-v1');
  assert.deepEqual(result.disclosedPaths, ['inspection.result']);
  assert.equal(JSON.stringify(result).includes('private supplier'), false);
  assert.equal(JSON.stringify(result).includes('private.pdf'), false);
});
