import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createPublicProofRouter } from '../src/routes/public-proofs.js';

test('public proof route returns minimum metadata and never serializes a business snapshot', async (context) => {
  const contractAddress = '0x0000000000000000000000000000000000000001';
  const proofRow = {
    public_id: 'PANDU-0123456789ABCDEF', anchor_status: 'confirmed', chain_id: 421614,
    contract_address: contractAddress, commitment: Buffer.alloc(32, 0xab), transaction_hash: '0xtx',
    public_snapshot: { supplier: 'fixture supplier', measurement: 'fixture measurement' },
  };
  const supabaseAdmin = {
    from(table) {
      assert.equal(table, 'quality_proofs');
      return {
        select(columns) {
          assert.equal(columns, 'public_id,anchor_status,commitment,chain_id,contract_address,transaction_hash');
          return { eq() { return { maybeSingle: async () => ({ data: proofRow, error: null }) }; } };
        },
      };
    },
  };
  const app = express();
  app.use('/api/public', createPublicProofRouter({
    supabaseAdmin, tokenSecret: 'test-only-secret-value-with-more-than-32-bytes',
    legacyRegistryAddress: null, proofIdBytes: () => `0x${'11'.repeat(32)}`,
    readChainMetadata: async () => ({ attester: '0x0000000000000000000000000000000000000002', timestamp: 12345n, revoked: false }),
  }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/proofs/${proofRow.public_id}`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), [
    'anchoredAt', 'attester', 'chainId', 'commitment', 'contractAddress', 'legacy',
    'proofId', 'revoked', 'status', 'transactionHash',
  ].sort());
  assert.equal(body.status, 'ANCHORED');
  assert.equal(body.transactionHash, '0xtx');
  assert.equal(body.attester, '0x0000000000000000000000000000000000000002');
  assert.equal(body.anchoredAt, 12345);
  assert.equal(JSON.stringify(body).includes('fixture supplier'), false);
  assert.equal(JSON.stringify(body).includes('fixture measurement'), false);
});
