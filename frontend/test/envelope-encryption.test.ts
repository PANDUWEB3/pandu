import { describe, it, expect } from 'vitest';
import {
  encryptFileEnvelope,
  decryptFileClient,
  decryptFileWithRecovery,
  recoverDekWithPassphrase,
  recoverDekWithWallet,
  recoverDekWithPasskey,
  encryptFileName,
  decryptFileName,
  deriveKeyFromPassphrase,
  deriveRecoveryKeyFromPassphrase,
  validateRecoveryPassphrase,
  sha256Hex,
} from '../src/crypto';

describe('Envelope Encryption & Active Recovery Flow', () => {
  const originalFileName = 'hasil_uji_laboratorium_beton_k400.pdf';
  const fileContent = new TextEncoder().encode(
    'Laporan Mutu PANDU: Uji Kuat Tekan Beton K-400 mencapai 42.5 MPa pada umur 28 hari. PASS.'
  );

  it('menerapkan minimum passphrase dan menghasilkan vector PBKDF2-SHA256 600000 iterasi', async () => {
    expect(() => validateRecoveryPassphrase('short1')).toThrow(/minimal 12/);
    expect(() => validateRecoveryPassphrase('abcdefghijkl')).toThrow(/huruf dan angka/);
    expect(() => validateRecoveryPassphrase('111111111111')).toThrow(/huruf dan angka/);
    expect(validateRecoveryPassphrase('correct horse battery staple 2026')).toBe('correct horse battery staple 2026');
    await expect(deriveRecoveryKeyFromPassphrase('correct horse battery staple 2026', '000102030405060708090a0b0c0d0e0f', 599999)).rejects.toThrow(/600000/);

    const key = await deriveRecoveryKeyFromPassphrase('correct horse battery staple 2026', '000102030405060708090a0b0c0d0e0f');
    const sealed = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: new Uint8Array([16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]) },
      key,
      new TextEncoder().encode('PANDU recovery vector')
    );
    expect(Array.from(new Uint8Array(sealed), b => b.toString(16).padStart(2, '0')).join(''))
      .toBe('33353fe75ea3bb87f45c70fa7f71b8a6203925ed82b0737b6568574adc30888222915b568d');
  });

  it('berhasil melakukan enkripsi nama berkas dan dekripsi kembali', async () => {
    const key = await deriveKeyFromPassphrase('test-file-key-password', 'aabbccddeeff00112233445566778899', 1000);
    const encryptedName = await encryptFileName(originalFileName, key);

    expect(encryptedName.startsWith('enc:v1:')).toBe(true);
    expect(encryptedName).not.toContain('hasil_uji_laboratorium');

    const decryptedName = await decryptFileName(encryptedName, key);
    expect(decryptedName).toBe(originalFileName);
  });

  it('mengenkripsi berkas dengan envelope DEK dan memulihkan via passphrase recovery', async () => {
    const recoveryPassphrase = 'pandu-super-secret-recovery-phrase-2026';
    const mockWalletKey = await deriveKeyFromPassphrase('wallet-kek', '11223344556677889900aabbccddeeff', 1000);
    const mockPasskeyKey = await deriveKeyFromPassphrase('passkey-kek', 'ffeeddccbbaa99887766554433221100', 1000);

    // 1. Enkripsi berkas menggunakan envelope encryption
    const { payload, fileHmac, fileSalt, wrappedKeyMeta } = await encryptFileEnvelope(fileContent, {
      kekWallet: mockWalletKey,
      walletAccount: '0x1234567890123456789012345678901234567890',
      kekPasskey: mockPasskeyKey,
      recoveryPassphrase,
    });

    expect(payload.length).toBeGreaterThan(12);
    expect(fileHmac).toBeDefined();
    expect(fileSalt).toHaveLength(64);
    expect(wrappedKeyMeta.version).toBe(1);
    expect(wrappedKeyMeta.wrappedBy.recovery).toBeDefined();
    expect(wrappedKeyMeta.wrappedBy.wallet).toBeDefined();
    expect(wrappedKeyMeta.wrappedBy.passkey).toBeDefined();

    // 2. Alur Pemulihan Nyata via Passphrase Recovery
    const recoveredDek = await recoverDekWithPassphrase(wrappedKeyMeta, recoveryPassphrase);
    expect(recoveredDek).toBeDefined();

    const { decryptedBytes } = await decryptFileClient(payload, recoveredDek);
    const decryptedText = new TextDecoder().decode(decryptedBytes);
    expect(decryptedText).toBe(new TextDecoder().decode(fileContent));

    // 3. Uji helper dekripsi recovery langsung
    const directRecovery = await decryptFileWithRecovery(payload, wrappedKeyMeta, recoveryPassphrase);
    expect(new TextDecoder().decode(directRecovery.decryptedBytes)).toBe(new TextDecoder().decode(fileContent));

    // 4. Uji alur dekripsi menggunakan Wallet KEK
    const recoveredViaWallet = await recoverDekWithWallet(wrappedKeyMeta, mockWalletKey);
    const { decryptedBytes: walletDecrypted } = await decryptFileClient(payload, recoveredViaWallet);
    expect(new TextDecoder().decode(walletDecrypted)).toBe(new TextDecoder().decode(fileContent));

    // 5. Uji alur dekripsi menggunakan Passkey KEK
    const recoveredViaPasskey = await recoverDekWithPasskey(wrappedKeyMeta, mockPasskeyKey);
    const { decryptedBytes: passkeyDecrypted } = await decryptFileClient(payload, recoveredViaPasskey);
    expect(new TextDecoder().decode(passkeyDecrypted)).toBe(new TextDecoder().decode(fileContent));
  });

  it('gagal memulihkan jika passphrase recovery salah', async () => {
    const recoveryPassphrase = 'correct-passphrase-2026';
    const wrongPassphrase = 'wrong-passphrase-hacker';

    const { payload, wrappedKeyMeta } = await encryptFileEnvelope(fileContent, {
      recoveryPassphrase,
    });

    await expect(
      decryptFileWithRecovery(payload, wrappedKeyMeta, wrongPassphrase)
    ).rejects.toThrow();
  });
});
