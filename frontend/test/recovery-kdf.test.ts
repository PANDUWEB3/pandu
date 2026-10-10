import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveRawKekFromPassphrase,
  deriveKeyFromPassphrase,
  validateRecoveryPassphrase,
  encryptFileEnvelope,
  decryptFileClient,
  recoverDekWithPassphrase,
  wrapDek,
  importDek,
  bytesToHex,
  hexToBytes,
  RECOVERY_KDF_ITERATIONS,
  RECOVERY_KDF_ALGORITHM,
  MIN_RECOVERY_PASSPHRASE_LENGTH,
} from '../src/crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../test-vectors/recovery-kdf-vectors.json'), 'utf8')
);

describe('KDF KEK Recovery: PBKDF2-SHA256 (test vector lintas implementasi)', () => {
  it('konstanta memenuhi ambang minimum (>= 600.000 iterasi, panjang passphrase >= 12)', () => {
    expect(RECOVERY_KDF_ITERATIONS).toBeGreaterThanOrEqual(600000);
    expect(vectors.minimumIterations).toBeGreaterThanOrEqual(600000);
    expect(RECOVERY_KDF_ITERATIONS).toBe(vectors.minimumIterations);
    expect(MIN_RECOVERY_PASSPHRASE_LENGTH).toBe(vectors.minimumPassphraseLength);
    expect(RECOVERY_KDF_ALGORITHM).toBe(vectors.kdf);
  });

  vectors.vectors.forEach((vector: any, index: number) => {
    it(`[Vector ${index + 1}] ${vector.description}`, async () => {
      const raw = await deriveRawKekFromPassphrase(vector.passphrase, vector.saltHex, vector.iterations);
      expect(bytesToHex(raw)).toBe(vector.derivedKeyHex);

      // Varian CryptoKey (AES-GCM) harus menghasilkan enkripsi/deskripsi yang setara
      const kek = await deriveKeyFromPassphrase(vector.passphrase, vector.saltHex, vector.iterations);
      const rawDek = crypto.getRandomValues(new Uint8Array(32));
      const wrapped = await wrapDek(rawDek, kek);
      const unwrapped = await recoverDekWithPassphrase(
        { version: 1, wrappedBy: { recovery: { ...wrapped, salt: vector.saltHex, iterations: vector.iterations } } },
        vector.passphrase
      );
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hexToBytes(wrapped.iv) },
        kek,
        hexToBytes(wrapped.ciphertext)
      );
      expect(bytesToHex(new Uint8Array(plain))).toBe(bytesToHex(rawDek));
    });
  });
});

describe('Validasi panjang & kualitas frasa sandi pemulihan', () => {
  it('menerima passphrase yang memenuhi syarat', () => {
    expect(validateRecoveryPassphrase('PANDU-recovery-2026-A1')).toBe('PANDU-recovery-2026-A1');
    expect(validateRecoveryPassphrase('rahasia123456')).toBe('rahasia123456');
  });

  vectors.invalidPassphrases.forEach((item: any) => {
    it(`menolak "${item.value}" (${item.reason})`, () => {
      expect(() => validateRecoveryPassphrase(item.value)).toThrow();
    });
  });

  it('envelope menolak passphrase pendek saat pembungkusan', async () => {
    await expect(
      encryptFileEnvelope(new TextEncoder().encode('data'), { recoveryPassphrase: 'pendek1' })
    ).rejects.toThrow(/minimal 12 karakter/);
  });
});

describe('Envelope recovery memakai KDF baru (600.000 iterasi, field kdf eksplisit)', () => {
  it('membungkus DEK dengan iterasi 600000 dan label kdf PBKDF2-SHA256', async () => {
    const passphrase = 'pandu-envelope-2026';
    const { payload, wrappedKeyMeta, dek } = await encryptFileEnvelope(new TextEncoder().encode('isi berkas uji'), {
      recoveryPassphrase: passphrase,
    });
    const recovery = wrappedKeyMeta.wrappedBy.recovery;
    expect(recovery.iterations).toBe(600000);
    expect(recovery.kdf).toBe('PBKDF2-SHA256');

    const recovered = await recoverDekWithPassphrase(wrappedKeyMeta, passphrase);
    const { decryptedBytes } = await decryptFileClient(payload, recovered);
    expect(new TextDecoder().decode(decryptedBytes)).toBe('isi berkas uji');
    expect(dek).toBeDefined();
  });

  it('metadata legacy (iterations 100000 tanpa field kdf) tetap dapat dibuka', async () => {
    const passphrase = 'legacy-passphrase-1';
    const saltHex = '0123456789abcdef0123456789abcdef';
    const rawDek = crypto.getRandomValues(new Uint8Array(32));
    const legacyKek = await deriveKeyFromPassphrase(passphrase, saltHex, 100000);
    const wrapped = await wrapDek(rawDek, legacyKek);
    const legacyMeta = {
      version: 1 as const,
      wrappedBy: { recovery: { ...wrapped, salt: saltHex, iterations: 100000 } },
    };
    const recovered = await recoverDekWithPassphrase(legacyMeta, passphrase);
    const exported = await crypto.subtle.exportKey('raw', recovered);
    expect(bytesToHex(new Uint8Array(exported))).toBe(bytesToHex(rawDek));
    expect(importDek(rawDek)).toBeDefined();
  });
});
