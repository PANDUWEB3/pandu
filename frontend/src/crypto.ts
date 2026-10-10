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
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Enkripsi berkas menggunakan AES-GCM 256-bit di sisi klien
 * Mengembalikan:
 * - payload: [12-byte IV] + [Ciphertext]
 * - ciphertextSha256: Hash dari payload terenkripsi (untuk pelacakan Pinata)
 * - plaintextSha256: Hash dari berkas asli
 * - fileHmac: HMAC-SHA256 dari berkas asli dengan salt per-file
 * - fileSalt: Salt unik per-file (32-byte hex)
 */
export async function encryptFileClient(
  file: File,
  key: CryptoKey,
  providedSalt?: string
): Promise<{
  payload: Uint8Array;
  ciphertextSha256: string;
  plaintextSha256: string;
  fileHmac: string;
  fileSalt: string;
}> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBytes = await file.arrayBuffer();
  const plaintextSha256 = await sha256Hex(fileBytes);

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

  return { payload, ciphertextSha256, plaintextSha256, fileHmac, fileSalt };
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
