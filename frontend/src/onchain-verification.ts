import { Contract, JsonRpcProvider, getAddress, isHexString } from 'ethers';

const V2_ABI = [
  'function getProof(bytes32) view returns ((bytes32 proofId,bytes32 batchRef,bytes32 evidenceHash,address attester,address relayer,uint64 timestamp,bool revoked,address revoker,uint64 revokedAt,bytes32 revokeReason))',
  'function isValid(bytes32) view returns (bool)',
  'function verify(bytes32,bytes32) view returns (bool)',
];

const LEGACY_ABI = [
  'function getProof(bytes32) view returns ((bytes32 proofId,bytes32 batchRef,bytes32 evidenceHash,address attester,uint64 timestamp,bool revoked,address revoker,uint64 revokedAt))',
];

export type ChainProofMetadata = {
  proofId: string;
  chainId: number;
  contractAddress: string;
  commitment: string;
  legacy: boolean;
};

export type OnchainProofStatus = {
  status: 'VERIFIED' | 'REVOKED' | 'MISMATCH' | 'LEGACY_UNSIGNED' | 'LEGACY_REVOKED';
  commitmentMatches: boolean;
  isValid: boolean | null;
  verify: boolean | null;
  revoked: boolean;
  issuerSignature: 'accepted-by-v2-anchor' | 'not-checked-legacy';
  attester: string;
  relayer: string | null;
  timestamp: number;
};

type ContractReader = {
  getProof(proofId: string): Promise<any>;
  isValid?(proofId: string): Promise<boolean>;
  verify?(proofId: string, commitment: string): Promise<boolean>;
};

type Dependencies = {
  providerFactory?: (rpcUrl: string, chainId: number) => any;
  contractFactory?: (address: string, abi: string[], provider: any) => ContractReader;
};

/** Read-only verification: the server supplies identifiers only; chain state decides status. */
export async function verifyProofOnchain(
  metadata: ChainProofMetadata,
  config: { rpcUrl: string; chainId: number; registryAddress: string; legacyRegistryAddress?: string },
  dependencies: Dependencies = {},
): Promise<OnchainProofStatus> {
  if (metadata.chainId !== config.chainId) throw new Error('Chain ID bukti tidak cocok dengan konfigurasi publik.');
  if (!isHexString(metadata.proofId, 32) || !isHexString(metadata.commitment, 32)) {
    throw new Error('ID proof atau commitment tidak valid.');
  }

  const expectedAddress = getAddress(metadata.legacy ? (config.legacyRegistryAddress || '') : config.registryAddress);
  const suppliedAddress = getAddress(metadata.contractAddress);
  if (suppliedAddress !== expectedAddress) throw new Error('Alamat registry bukti tidak cocok dengan konfigurasi publik.');

  const providerFactory = dependencies.providerFactory || ((rpcUrl, chainId) => new JsonRpcProvider(rpcUrl, chainId));
  const contractFactory = dependencies.contractFactory || ((address, abi, provider) => new Contract(address, abi, provider) as unknown as ContractReader);
  const provider = providerFactory(config.rpcUrl, config.chainId);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(config.chainId)) throw new Error('RPC tersambung ke jaringan yang salah.');

  const registry = contractFactory(suppliedAddress, metadata.legacy ? LEGACY_ABI : V2_ABI, provider);
  const proof = await registry.getProof(metadata.proofId);
  const commitmentMatches = String(proof.evidenceHash).toLowerCase() === metadata.commitment.toLowerCase();
  const revoked = Boolean(proof.revoked);
  const timestamp = Number(proof.timestamp);
  const attester = String(proof.attester);

  if (metadata.legacy) {
    return {
      status: revoked ? 'LEGACY_REVOKED' : commitmentMatches ? 'LEGACY_UNSIGNED' : 'MISMATCH', commitmentMatches,
      isValid: null, verify: null, revoked, issuerSignature: 'not-checked-legacy',
      attester, relayer: null, timestamp,
    };
  }

  if (!registry.isValid || !registry.verify) throw new Error('ABI registry v2 tidak menyediakan isValid/verify.');
  const [valid, verified] = await Promise.all([
    registry.isValid(metadata.proofId),
    registry.verify(metadata.proofId, metadata.commitment),
  ]);
  const status = revoked ? 'REVOKED' : valid && verified && commitmentMatches ? 'VERIFIED' : 'MISMATCH';
  return {
    status, commitmentMatches, isValid: Boolean(valid), verify: Boolean(verified), revoked,
    issuerSignature: 'accepted-by-v2-anchor', attester,
    relayer: String(proof.relayer), timestamp,
  };
}

