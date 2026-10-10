import test from 'node:test';
import assert from 'node:assert/strict';
import { TypedDataEncoder } from 'ethers';

// Test EIP-712 typed data structure identik dengan kontrak PANDUQualityRegistry v2
test('EIP-712 Typed Data Digest identik antara Backend (ethers) dan Smart Contract (Solidity)', async () => {
  const domain = {
    name: 'PANDUQualityRegistry',
    version: '2',
    chainId: 421614,
    verifyingContract: '0x1234567890123456789012345678901234567890',
  };

  const anchorTypes = {
    Anchor: [
      { name: 'proofId', type: 'bytes32' },
      { name: 'batchRef', type: 'bytes32' },
      { name: 'evidenceHash', type: 'bytes32' },
      { name: 'attester', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const anchorVal = {
    proofId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    batchRef: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    evidenceHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    attester: '0x0000000000000000000000000000000000000001',
    deadline: 1800000000n,
  };

  const anchorDigest = TypedDataEncoder.hash(domain, anchorTypes, anchorVal);
  assert.equal(
    anchorDigest,
    '0xc5487dd99f92a161a235a72bfcfb62386e5659e86ceab768713c46806848dc30',
    'Anchor digest harus sama persis dengan perhitungan kontrak Solidity'
  );

  const revokeTypes = {
    Revoke: [
      { name: 'proofId', type: 'bytes32' },
      { name: 'reasonHash', type: 'bytes32' },
      { name: 'deadline', type: 'uint256' },
    ],
  };

  const revokeVal = {
    proofId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    reasonHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    deadline: 1800000000n,
  };

  const revokeDigest = TypedDataEncoder.hash(domain, revokeTypes, revokeVal);
  assert.equal(
    revokeDigest,
    '0xbc5fb621482c7117d2fdf7ad5781f44df7a02d6d22748c0cfcf307ce29dc1f65',
    'Revoke digest harus sama persis dengan perhitungan kontrak Solidity'
  );
});
