import express from 'express';
import { createHash, createHmac } from 'node:crypto';
import { getAddress } from 'ethers';
import { publicProofMetadata } from '../public-proof-metadata.js';

function databaseBytes32(value) {
  return `\\x${String(value).replace(/^0x/, '')}`;
}

function tokenDigest(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** Public proof routes return identifiers and minimum chain metadata, never business snapshots. */
export function createPublicProofRouter({ supabaseAdmin, tokenSecret, legacyRegistryAddress = null, proofIdBytes, readChainMetadata = async () => null }) {
  const router = express.Router();

  router.get('/resolve', async (req, res) => {
    if (!supabaseAdmin || !tokenSecret || tokenSecret.length < 32) {
      return res.status(503).json({ status: 'UNAVAILABLE', message: 'Layanan verifikasi belum dikonfigurasi.' });
    }
    const code = String(req.query.code || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,63}$/.test(code)) {
      return res.status(404).json({ status: 'NOT_FOUND', message: 'Nomor batch tidak ditemukan.' });
    }
    try {
      const { data: batches, error: batchError } = await supabaseAdmin.from('batches').select('id').ilike('batch_code', code.replace(/[%_\\]/g, '\\$&'));
      if (batchError) throw batchError;
      if (!batches?.length) return res.status(404).json({ status: 'NOT_FOUND', message: 'Nomor batch tidak ditemukan.' });
      const { data: inspections, error: inspectionError } = await supabaseAdmin.from('inspections').select('id').in('batch_id', batches.map((batch) => batch.id));
      if (inspectionError) throw inspectionError;
      if (!inspections?.length) return res.status(404).json({ status: 'NOT_FOUND', message: 'Batch ini belum punya bukti.' });
      const { data: proofs, error: proofError } = await supabaseAdmin.from('quality_proofs')
        .select('id,anchor_status,created_at').in('inspection_id', inspections.map((inspection) => inspection.id))
        .order('created_at', { ascending: false });
      if (proofError) throw proofError;
      if (!proofs?.length) return res.status(404).json({ status: 'NOT_FOUND', message: 'Batch ini belum punya bukti.' });
      const proof = proofs.find((item) => item.anchor_status === 'confirmed') || proofs[0];
      const token = createHmac('sha256', tokenSecret).update(proof.id).digest('base64url');
      return res.json({ token });
    } catch {
      return res.status(503).json({ status: 'UNAVAILABLE', message: 'Pencarian belum dapat diproses. Coba lagi.' });
    }
  });

  router.get('/proofs/:token', async (req, res) => {
    if (!supabaseAdmin) return res.status(503).json({ status: 'UNAVAILABLE', message: 'Layanan verifikasi belum dikonfigurasi.' });
    const token = String(req.params.token || '');
    const byPublicId = /^PANDU-[A-Fa-f0-9]{16}$/.test(token);
    if (!byPublicId && !/^[A-Za-z0-9_-]{32,80}$/.test(token)) {
      return res.status(404).json({ status: 'NOT_FOUND', message: 'Bukti PANDU tidak ditemukan.' });
    }
    try {
      const query = supabaseAdmin.from('quality_proofs')
        .select('public_id,anchor_status,commitment,chain_id,contract_address,transaction_hash,merkle_version,disclosed_paths');
      const { data: proof, error } = await (byPublicId
        ? query.eq('public_id', token.toUpperCase())
        : query.eq('public_token_hash', databaseBytes32(tokenDigest(token)))).maybeSingle();
      if (error) throw error;
      if (!proof) return res.status(404).json({ status: 'NOT_FOUND', message: 'Bukti PANDU tidak ditemukan.' });
      const legacy = Boolean(legacyRegistryAddress) && getAddress(proof.contract_address) === legacyRegistryAddress;
      const proofId = proofIdBytes(proof.public_id);
      let onchain = null;
      try { onchain = await readChainMetadata(proof, proofId, legacy); } catch { /* metadata is optional; the browser performs its own chain check */ }
      return res.json(publicProofMetadata(proof, { proofId, legacy, onchain }));
    } catch {
      return res.status(503).json({ status: 'UNAVAILABLE', message: 'Metadata verifikasi belum tersedia. Coba lagi.' });
    }
  });
  return router;
}
