import {
  decryptField, encryptField, generateOrganizationDataKey, unwrapOrganizationDataKey,
  wrapOrganizationDataKey, wrapOrganizationDataKeyWithRecovery, type DbCiphertextEnvelope,
} from './dbcrypto';
import { computeMerkleRoot, type MerkleLeaf } from './merkle';

export interface EncryptedProofEnvelope extends DbCiphertextEnvelope {
  wrappedDek: {
    wallet: Awaited<ReturnType<typeof wrapOrganizationDataKey>> & { account: string };
    recovery: Awaited<ReturnType<typeof wrapOrganizationDataKeyWithRecovery>>;
  };
}

export async function createEncryptedProofCommitment(options: {
  organizationId: string;
  proofRowId: string;
  publicId: string;
  leaves: MerkleLeaf[];
  walletKek: CryptoKey;
  walletAccount: string;
  recoveryPassphrase: string;
}): Promise<{ root: string; privateEnvelope: EncryptedProofEnvelope }> {
  const root = await computeMerkleRoot(options.leaves);
  const kid = `proof:${options.publicId}`;
  const dek = generateOrganizationDataKey();
  const privateData = await encryptField({ leaves: options.leaves }, dek, kid, {
    organizationId: options.organizationId,
    table: 'quality_proofs',
    rowId: options.proofRowId,
    column: 'private_snapshot_ciphertext',
  });
  const wrappedDek = {
    wallet: { ...await wrapOrganizationDataKey(dek, options.walletKek, kid), account: options.walletAccount },
    recovery: await wrapOrganizationDataKeyWithRecovery(dek, options.recoveryPassphrase, kid),
  };
  return { root, privateEnvelope: { ...privateData, wrappedDek } };
}

export async function openEncryptedProofCommitment(options: {
  organizationId: string;
  proofRowId: string;
  envelope: EncryptedProofEnvelope;
  walletKek: CryptoKey;
  walletAccount: string;
}): Promise<{ root: string; leaves: MerkleLeaf[] }> {
  const walletWrapper = options.envelope.wrappedDek?.wallet;
  if (!walletWrapper || walletWrapper.account.toLowerCase() !== options.walletAccount.toLowerCase()) throw new Error('Proof key unavailable for this wallet.');
  const dek = await unwrapOrganizationDataKey(walletWrapper, options.walletKek);
  const contents = await decryptField<{ leaves: MerkleLeaf[] }>(options.envelope, dek, {
    organizationId: options.organizationId,
    table: 'quality_proofs',
    rowId: options.proofRowId,
    column: 'private_snapshot_ciphertext',
  });
  return { root: await computeMerkleRoot(contents.leaves), leaves: contents.leaves };
}
