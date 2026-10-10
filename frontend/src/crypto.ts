/**
 * PANDU Client-side Cryptography Module
 * - Enkripsi & Dekripsi AES-GCM (256-bit)
 * - Derivasi Kunci dari Wallet (personal_sign + HKDF RFC 5869 dengan deteksi non-deterministik)
 * - Derivasi Kunci dari Passkey/WebAuthn PRF
 * - HMAC-SHA256 per berkas bukti menggunakan salt per-file
 * - Serialisasi Canonical JSON deterministik
 * - Perhitungan evidenceHash = SHA-256(canonicalJson)
 * 
 * ATURAN KEAMANAN: Kunci enkripsi dan data mentah tidak pernah dikirim ke backend!
 */

/** Konversi Uint8Array ke Hex String */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Konversi Hex String ke Uint8Array */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Serialisasi JSON deterministik dengan pengurutan alfabetis keys */
export function canonicalJson(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const sortedKeys = Object.keys(value).sort();
  return `{${sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

/** Hitung SHA-256 hex string dari Buffer/ArrayBuffer/Uint8Array/string */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let buf: ArrayBuffer;
  if (typeof data === 'string') {
    buf = new TextEncoder().encode(data).buffer as ArrayBuffer;
  } else if (data instanceof Uint8Array) {
    buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } else {
    buf = data;
  }
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hitung HMAC-SHA256 dari berkas menggunakan salt per berkas sebagai kunci HMAC.
 * Mencegah serangan kamus / rainbow table pada bukti berentropi rendah dalam snapshot.
 */
export async function computeFileHmacSha256(
  fileBytes: ArrayBuffer | Uint8Array,
  saltHexOrBytes: string | Uint8Array
): Promise<string> {
  const saltBytes =
    typeof saltHexOrBytes === 'string'
      ? hexToBytes(saltHexOrBytes)
      : saltHexOrBytes;

  const hmacKey = await crypto.subtle.importKey(
    'raw',
    saltBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  let dataBuf: ArrayBuffer;
  if (fileBytes instanceof Uint8Array) {
    dataBuf = fileBytes.buffer.slice(
      fileBytes.byteOffset,
      fileBytes.byteOffset + fileBytes.byteLength
    ) as ArrayBuffer;
  } else {
    dataBuf = fileBytes;
  }

  const sig = await crypto.subtle.sign('HMAC', hmacKey, dataBuf);
  return bytesToHex(new Uint8Array(sig));
}

/** Pesan personal_sign terstruktur dengan domain dan tujuan spesifik PANDU */
export function buildWalletKeyDerivationMessage(account: string): string {
  const domain = typeof window !== 'undefined' && window.location ? window.location.host : 'pandu.id';
  return (
    `[PANDU Quality Registry Security Key]\n\n` +
    `Domain: ${domain}\n` +
    `Account: ${account.toLowerCase()}\n` +
    `Purpose: Derive Client-Side AES-GCM-256 Encryption Key for PANDU Quality Proofs\n` +
    `Notice: This request will not cost any gas or make any blockchain transaction. ` +
    `Do not sign if requested by an untrusted domain.`
  );
}

/**
 * Derivasi CryptoKey AES-GCM dari signature personal_sign wallet menggunakan HKDF (RFC 5869).
 * Melakukan verifikasi deterministik (minta tanda tangan 2x) untuk mendeteksi
 * hardware wallet / wallet dengan randomized entropy hedging (non-deterministic RFC 6979).
 *
 * OPSI PEMULIHAN / RECOVERY:
 * 1. Deterministic Wallet Recovery: Pengguna dengan wallet standar (MetaMask EOA)
 *    dapat memulihkan kunci kapan saja dengan menandatangani pesan domain yang sama.
 * 2. Non-deterministic / Hardware Wallet Fallback: Jika wallet menghasilkan signature
 *    berbeda (hedged k), sistem menolak derivasi personal_sign dan menyarankan
 *    metode Passkey (WebAuthn PRF) atau passphrase cadangan.
 * 3. Export Key Backup: Klien dapat mengekspor salinan kunci terenkripsi dengan passphrase
 *    terpisah untuk disimpan offline (cold storage backup).
 */
export async function deriveKeyFromWallet(account: string): Promise<CryptoKey> {
  if (!window.ethereum) throw new Error('MetaMask / Ethereum provider tidak terdeteksi.');
  const message = buildWalletKeyDerivationMessage(account);

  // Minta tanda tangan pertama
  const sig1 = (await window.ethereum.request({
    method: 'personal_sign',
    params: [message, account],
  })) as string;

  // Minta tanda tangan kedua untuk memvalidasi determinisme (mencegah kehilangan kunci
  // pada hardware wallet seperti Ledger/Trezor dengan non-deterministic RFC 6979 hedging)
  const sig2 = (await window.ethereum.request({
    method: 'personal_sign',
    params: [message, account],
  })) as string;

  if (sig1.toLowerCase() !== sig2.toLowerCase()) {
    throw new Error(
      'Wallet Anda menghasilkan tanda tangan non-deterministik (tanda tangan 1 berbeda dari tanda tangan 2). ' +
      'Hal ini umum pada beberapa hardware wallet dengan entropy hedging. ' +
      'Untuk mencegah file tidak bisa didekripsi kemudian hari, gunakan opsi Passkey / WebAuthn atau frasa sandi (passphrase).'
    );
  }

  // Turunkan kunci dengan HKDF (HMAC-based Extract-and-Expand Key Derivation Function)
  const sigBytes = new TextEncoder().encode(sig1);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    sigBytes,
    'HKDF',
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('PANDU-HKDF-SALT-v2'),
      info: new TextEncoder().encode('PANDU-AES-GCM-256-CLIENT-KEY'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Derivasi CryptoKey AES-GCM dari Passkey (WebAuthn PRF extension jika didukung) atau fallback entropy */
export async function deriveKeyFromPasskey(saltString = 'PANDU'): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(saltString);
  // Cek apakah WebAuthn PRF extension tersedia di navigator.credentials
  if (window.PublicKeyCredential && (window.PublicKeyCredential as any).isConditionalMediationAvailable) {
    try {
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: window.location.hostname,
          userVerification: 'required',
          extensions: {
            prf: {
              eval: {
                first: salt,
              },
            },
          } as any,
        },
      })) as any;

      const prfResults = cred?.getClientExtensionResults()?.prf;
      if (prfResults?.results?.first) {
        const prfBytes = new Uint8Array(prfResults.results.first);
        return await crypto.subtle.importKey(
          'raw',
          prfBytes,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      }
    } catch (_) {
      // Fallback jika user membatalkan passkey prompt atau PRF belum didukung browser
    }
  }

  // Fallback PBKDF2 dari user passkey/passphrase prompt
  const passphrase = window.prompt('Masukkan frasa sandi (passphrase / passkey) untuk dekripsi:') || '';
  if (!passphrase) throw new Error('Frasa sandi / passkey diperlukan untuk dekripsi.');
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('PANDU-QUALITY-REGISTRY-KEY-SALT'),
      iterations: RECOVERY_KDF_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** KDF untuk KEK recovery. Argon2id direkomendasikan, PBKDF2-SHA256 minimal 600.000 iterasi. */
export const RECOVERY_KDF_ALGORITHM = 'PBKDF2-SHA256' as const;
export const RECOVERY_KDF_ITERATIONS = 600_000;
export const MIN_RECOVERY_PASSPHRASE_LENGTH = 12;

/**
 * Validasi panjang & entropi frasa sandi pemulihan saat pembuatan envelope.
 * Berlaku saat MENCIPTAKAN bungkus (wrap); saat unwrap, iterasi tersimpan di metadata.
 */
export function validateRecoveryPassphrase(passphrase: string): string {
  const value = String(passphrase ?? '');
  if (value.length < MIN_RECOVERY_PASSPHRASE_LENGTH) {
    throw new Error(
      `Frasa sandi pemulihan minimal ${MIN_RECOVERY_PASSPHRASE_LENGTH} karakter (diterima: ${value.length}).`
    );
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    throw new Error('Frasa sandi pemulihan harus memuat huruf dan angka.');
  }
  if (/^(.)\1+$/.test(value)) {
    throw new Error('Frasa sandi pemulihan tidak boleh hanya satu karakter berulang.');
  }
  return value;
}

export interface WrappedKeyEntry {
  iv: string; // 12-byte hex
  ciphertext: string; // hex
}

export interface RecoveryWrappedKeyEntry extends WrappedKeyEntry {
  salt: string; // hex salt untuk KDF
  iterations: number; // 600000 (PBKDF2-SHA256)
  kdf?: typeof RECOVERY_KDF_ALGORITHM | 'Argon2id'; // algoritma KDF eksplisit (v1 lama tanpa field ini = PBKDF2-SHA256)
}

export interface WrappedKeyMetadata {
  version: 1;
  wrappedBy: {
    wallet?: WrappedKeyEntry & { account?: string };
    passkey?: WrappedKeyEntry;
    recovery: RecoveryWrappedKeyEntry;
  };
}

/** Hasilkan DEK acak 256-bit (32 byte) */
export function generateDek(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Import DEK mentah (32 byte) menjadi CryptoKey AES-GCM */
export async function importDek(rawDek: Uint8Array): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    rawDek,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/** Exportable DEK -> raw bytes; only used when issuer deliberately creates a verifier share. */
export async function exportDekRaw(dek: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', dek));
}

/**
 * Turunkan KEK mentah (32 byte) dari passphrase pemulihan dan salt acak
 * menggunakan PBKDF2-SHA256. Default 600.000 iterasi (ambang minimum PANDU).
 * Metadata (salt + iterasi) disimpan di RecoveryWrappedKeyEntry.
 */
export async function deriveRawKekFromPassphrase(
  passphrase: string,
  saltHex: string,
  iterations = RECOVERY_KDF_ITERATIONS
): Promise<Uint8Array> {
  const saltBytes = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

/** Turunkan KEK AES-GCM-256 dari passphrase pemulihan. */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltHex: string,
  iterations = RECOVERY_KDF_ITERATIONS
): Promise<CryptoKey> {
  const rawKek = await deriveRawKekFromPassphrase(passphrase, saltHex, iterations);
  return await crypto.subtle.importKey(
    'raw',
    rawKek,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** KEK recovery production path: enforce strong passphrase and PBKDF2 floor. */
export async function deriveRecoveryKeyFromPassphrase(
  passphrase: string,
  saltHex: string,
  iterations = RECOVERY_KDF_ITERATIONS
): Promise<CryptoKey> {
  const value = validateRecoveryPassphrase(passphrase);
  if (!Number.isInteger(iterations) || iterations < RECOVERY_KDF_ITERATIONS) {
    throw new Error(`PBKDF2 recovery minimal ${RECOVERY_KDF_ITERATIONS} iterasi.`);
  }
  return deriveKeyFromPassphrase(value, saltHex, iterations);
}

/**
 * Bungkus (wrap) DEK menggunakan KEK via AES-GCM 256-bit
 */
export async function wrapDek(
  rawDek: Uint8Array,
  kek: CryptoKey
): Promise<WrappedKeyEntry> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawDek);
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encrypted)),
  };
}

/**
 * Buka bungkus (unwrap) DEK menggunakan KEK via AES-GCM 256-bit
 */
export async function unwrapDek(
  wrapped: WrappedKeyEntry,
  kek: CryptoKey
): Promise<CryptoKey> {
  const iv = hexToBytes(wrapped.iv);
  const ciphertext = hexToBytes(wrapped.ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    kek,
    ciphertext
  );
  return await importDek(new Uint8Array(decrypted));
}

/**
 * Alur Pemulihan Nyata: Buka bungkus DEK menggunakan frasa sandi (passphrase recovery)
 */
export async function recoverDekWithPassphrase(
  wrappedMeta: WrappedKeyMetadata,
  passphrase: string
): Promise<CryptoKey> {
  const rec = wrappedMeta?.wrappedBy?.recovery;
  if (!rec) throw new Error('Metadata pembungkus recovery tidak ditemukan.');
  const iterations = rec.iterations || RECOVERY_KDF_ITERATIONS;
  // Permit opening explicitly legacy envelopes (no `kdf` marker) so users can
  // migrate existing proofs; all newly wrapped recovery keys enforce the floor.
  const kekRecovery = !rec.kdf && iterations < RECOVERY_KDF_ITERATIONS
    ? await deriveKeyFromPassphrase(validateRecoveryPassphrase(passphrase), rec.salt, iterations)
    : await deriveRecoveryKeyFromPassphrase(passphrase, rec.salt, iterations);
  return await unwrapDek({ iv: rec.iv, ciphertext: rec.ciphertext }, kekRecovery);
}

/**
 * Alur Pemulihan Nyata: Buka bungkus DEK menggunakan KEK wallet
 */
export async function recoverDekWithWallet(
  wrappedMeta: WrappedKeyMetadata,
  kekWallet: CryptoKey
): Promise<CryptoKey> {
  const w = wrappedMeta?.wrappedBy?.wallet;
  if (!w) throw new Error('Metadata pembungkus wallet tidak ditemukan.');
  return await unwrapDek({ iv: w.iv, ciphertext: w.ciphertext }, kekWallet);
}

/**
 * Alur Pemulihan Nyata: Buka bungkus DEK menggunakan KEK passkey
 */
export async function recoverDekWithPasskey(
  wrappedMeta: WrappedKeyMetadata,
  kekPasskey: CryptoKey
): Promise<CryptoKey> {
  const p = wrappedMeta?.wrappedBy?.passkey;
  if (!p) throw new Error('Metadata pembungkus passkey tidak ditemukan.');
  return await unwrapDek({ iv: p.iv, ciphertext: p.ciphertext }, kekPasskey);
}

/**
 * Enkripsi nama berkas (original_name) di sisi klien dengan AES-GCM
 */
export async function encryptFileName(fileName: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(fileName);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `enc:v1:${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encrypted))}`;
}

/**
 * Dekripsi nama berkas (original_name) terenkripsi di sisi klien
 */
export async function decryptFileName(encryptedName: string, key: CryptoKey): Promise<string> {
  if (!encryptedName.startsWith('enc:v1:')) return encryptedName;
  const parts = encryptedName.split(':');
  if (parts.length < 4) throw new Error('Format nama file terenkripsi tidak valid.');
  const iv = hexToBytes(parts[2]);
  const ciphertext = hexToBytes(parts[3]);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

/**
 * Enkripsi berkas menggunakan pola Envelope Encryption sisi klien:
 * - DEK acak 256-bit per berkas
 * - Konten berkas dienkripsi dengan DEK via AES-GCM
 * - DEK dibungkus oleh KEK Wallet (HKDF), KEK Passkey (opsional), dan KEK Recovery Passphrase (PBKDF2)
 * - HMAC-SHA256 dihitung menggunakan salt per-file (plaintextSha256 TIDAK pernah dikirim/disimpan)
 */
export async function encryptFileEnvelope(
  fileBytes: ArrayBuffer | Uint8Array,
  options: {
    kekWallet?: CryptoKey;
    walletAccount?: string;
    kekPasskey?: CryptoKey;
    recoveryPassphrase: string;
    providedSalt?: string;
  }
): Promise<{
  payload: Uint8Array;
  ciphertextSha256: string;
  fileHmac: string;
  fileSalt: string;
  wrappedKeyMeta: WrappedKeyMetadata;
  dek: CryptoKey;
}> {
  const rawDek = generateDek();
  const dek = await importDek(rawDek);

  // 1. Enkripsi konten berkas dengan DEK
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dataBuf =
    fileBytes instanceof Uint8Array
      ? (fileBytes.buffer.slice(fileBytes.byteOffset, fileBytes.byteOffset + fileBytes.byteLength) as ArrayBuffer)
      : fileBytes;
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, dataBuf);

  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv);
  payload.set(new Uint8Array(ciphertext), iv.length);

  const ciphertextSha256 = await sha256Hex(payload);

  // 2. Hitung HMAC berkas dengan salt per-file
  const saltBytes = options.providedSalt
    ? hexToBytes(options.providedSalt)
    : crypto.getRandomValues(new Uint8Array(32));
  const fileSalt = bytesToHex(saltBytes);
  const fileHmac = await computeFileHmacSha256(fileBytes, saltBytes);

  // 3. Bungkus DEK dengan KEK recovery (PBKDF2-SHA256, validasi panjang passphrase)
  const recoveryPassphrase = validateRecoveryPassphrase(options.recoveryPassphrase);
  const recoverySalt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const iterations = RECOVERY_KDF_ITERATIONS;
  const kekRecovery = await deriveRecoveryKeyFromPassphrase(recoveryPassphrase, recoverySalt, iterations);
  const wrappedRecovery = await wrapDek(rawDek, kekRecovery);

  const wrappedBy: WrappedKeyMetadata['wrappedBy'] = {
    recovery: {
      ...wrappedRecovery,
      salt: recoverySalt,
      iterations,
      kdf: RECOVERY_KDF_ALGORITHM,
    },
  };

  // 4. Bungkus DEK dengan KEK Wallet jika tersedia
  if (options.kekWallet) {
    const wrappedWallet = await wrapDek(rawDek, options.kekWallet);
    wrappedBy.wallet = {
      ...wrappedWallet,
      account: options.walletAccount,
    };
  }

  // 5. Bungkus DEK dengan KEK Passkey jika tersedia
  if (options.kekPasskey) {
    const wrappedPasskey = await wrapDek(rawDek, options.kekPasskey);
    wrappedBy.passkey = wrappedPasskey;
  }

  const wrappedKeyMeta: WrappedKeyMetadata = {
    version: 1,
    wrappedBy,
  };

  return { payload, ciphertextSha256, fileHmac, fileSalt, wrappedKeyMeta, dek };
}

/**
 * Dekripsi berkas menggunakan alur recovery nyata (passphrase)
 */
export async function decryptFileWithRecovery(
  payload: Uint8Array,
  wrappedMeta: WrappedKeyMetadata,
  passphrase: string
): Promise<{ decryptedBytes: ArrayBuffer; decryptedSha256: string }> {
  const dek = await recoverDekWithPassphrase(wrappedMeta, passphrase);
  return await decryptFileClient(payload, dek);
}

/**
 * Enkripsi berkas menggunakan AES-GCM 256-bit di sisi klien (legacy wrapper)
 */
export async function encryptFileClient(
  file: File,
  key: CryptoKey,
  providedSalt?: string
): Promise<{
  payload: Uint8Array;
  ciphertextSha256: string;
  fileHmac: string;
  fileSalt: string;
}> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBytes = await file.arrayBuffer();

  const saltBytes = providedSalt
    ? hexToBytes(providedSalt)
    : crypto.getRandomValues(new Uint8Array(32));
  const fileSalt = bytesToHex(saltBytes);
  const fileHmac = await computeFileHmacSha256(fileBytes, saltBytes);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBytes);

  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv);
  payload.set(new Uint8Array(ciphertext), iv.length);

  const ciphertextSha256 = await sha256Hex(payload);

  return { payload, ciphertextSha256, fileHmac, fileSalt };
}

/**
 * Dekripsi payload [12-byte IV] + [Ciphertext] di sisi klien
 * Mengembalikan decryptedBytes dan SHA-256 dari data hasil dekripsi.
 */
export async function decryptFileClient(
  payload: Uint8Array,
  key: CryptoKey
): Promise<{ decryptedBytes: ArrayBuffer; decryptedSha256: string }> {
  if (payload.length < 12) throw new Error('Ukuran ciphertext tidak valid (terlalu pendek).');
  const iv = payload.slice(0, 12);
  const ciphertext = payload.slice(12);

  const decryptedBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decryptedSha256 = await sha256Hex(decryptedBytes);
  return { decryptedBytes, decryptedSha256 };
}

/**
 * Hitung evidenceHash dari objek canonical proof
 */
export async function computeCanonicalEvidenceHash(snapshot: any): Promise<string> {
  const jsonStr = canonicalJson(snapshot);
  const hash = await sha256Hex(jsonStr);
  return `0x${hash}`;
}
