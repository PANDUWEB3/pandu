/** Project a database row onto fields needed for the browser's read-only chain check. */
export function publicProofMetadata(proof, { proofId, legacy, onchain = null }) {
  const commitment = typeof proof.commitment === 'string'
    ? proof.commitment.replace(/^\\x/, '').replace(/^0x/, '')
    : Buffer.from(proof.commitment).toString('hex');
  return {
    status: proof.anchor_status === 'revoked' ? 'REVOKED' : proof.anchor_status === 'confirmed' ? 'ANCHORED' : 'PENDING',
    proofId,
    chainId: Number(proof.chain_id),
    contractAddress: proof.contract_address,
    legacy: Boolean(legacy),
    commitment: `0x${commitment}`,
    merkleVersion: proof.merkle_version || null,
    disclosedPaths: Array.isArray(proof.disclosed_paths) ? proof.disclosed_paths : [],
    attester: onchain?.attester ? String(onchain.attester) : null,
    anchoredAt: onchain?.timestamp === undefined ? null : Number(onchain.timestamp),
    revoked: onchain?.revoked === undefined ? proof.anchor_status === 'revoked' : Boolean(onchain.revoked),
    transactionHash: proof.transaction_hash,
  };
}
