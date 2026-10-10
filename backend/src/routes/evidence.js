import express from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';

export const MAX_CIPHERTEXT_BYTES = 10 * 1024 * 1024;
export const CIPHERTEXT_MIME = 'application/octet-stream';
const MIN_AES_GCM_ENVELOPE_BYTES = 12 + 16;

/** Accept only opaque .enc envelopes. The browser-supplied MIME is deliberately ignored. */
export function createCiphertextRouter({ storage, requireAuth = (_req, _res, next) => next(), maxBytes = MAX_CIPHERTEXT_BYTES }) {
  if (!storage || typeof storage.put !== 'function' || typeof storage.get !== 'function') {
    throw new TypeError('Ciphertext storage must implement put() and get().');
  }
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, callback) => {
      const isEnvelope = file.originalname.toLowerCase().endsWith('.enc');
      callback(isEnvelope ? null : new Error('Unggahan hanya menerima berkas ciphertext .enc.'), isEnvelope);
    },
  });

  router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Ciphertext .enc wajib disertakan.' });
      if (req.file.size < MIN_AES_GCM_ENVELOPE_BYTES) return res.status(400).json({ error: 'Envelope ciphertext tidak lengkap.' });
      if (req.file.size > maxBytes) return res.status(413).json({ error: 'Ciphertext melebihi batas ukuran.' });
      const cid = await storage.put(req.file.buffer);
      const sha256 = createHash('sha256').update(req.file.buffer).digest('hex');
      return res.status(201).json({ cid, sha256, mimeType: CIPHERTEXT_MIME, byteSize: req.file.size });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:cid', async (req, res, next) => {
    try {
      if (!/^[A-Za-z0-9]{20,120}$/.test(req.params.cid)) return res.status(404).json({ error: 'Ciphertext tidak ditemukan.' });
      const bytes = await storage.get(req.params.cid);
      if (!bytes) return res.status(404).json({ error: 'Ciphertext tidak ditemukan.' });
      res.type(CIPHERTEXT_MIME).set('Cache-Control', 'private, no-store').send(Buffer.from(bytes));
    } catch (error) {
      next(error);
    }
  });
  return router;
}

