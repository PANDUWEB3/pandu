import { z } from 'zod';

/** Shape-only validation. Backend code must never decrypt or interpret envelope data. */
export const DbCiphertextEnvelopeSchema = z.object({
  v: z.literal(1),
  alg: z.literal('A256GCM'),
  kid: z.string().min(1).max(128),
  iv: z.string().min(16).max(32),
  data: z.string().min(24).max(14_000_000),
  aad: z.string().min(2).max(2048),
}).strict();

export function validateCiphertextEnvelopeShape(value) {
  return DbCiphertextEnvelopeSchema.safeParse(value);
}
