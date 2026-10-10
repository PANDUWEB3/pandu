import { createHmac } from 'node:crypto';

/** Persist only a keyed digest of a Google subject; the secret stays in backend environment. */
export function hashGoogleSubject(subject, pepper) {
  if (typeof subject !== 'string' || subject.length < 1 || subject.length > 512) throw new Error('Invalid Google subject.');
  if (typeof pepper !== 'string' || Buffer.byteLength(pepper, 'utf8') < 32) throw new Error('GOOGLE_SUB_PEPPER must contain at least 32 bytes.');
  return createHmac('sha256', pepper).update(subject, 'utf8').digest();
}
