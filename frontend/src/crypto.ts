/**
 * PANDU Client-side Cryptography Module
 * - Enkripsi & Dekripsi AES-GCM (256-bit)
 * - Derivasi Kunci dari Wallet (personal_sign PBKDF2) atau Passkey/WebAuthn PRF
 * - Serialisasi Canonical JSON deterministik
 * - Perhitungan evidenceHash = SHA-256(canonicalJson)
 * 
 * ATURAN KEAMANAN: Kunci enkripsi dan data mentah tidak pernah dikirim ke backend!
 */

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

/** Derivasi CryptoKey AES-GCM dari signature personal_sign wallet */
export async function deriveKeyFromWallet(account: string): Promise<CryptoKey> {
  if (!window.ethereum) throw new Error('MetaMask / Ethereum provider tidak terdeteksi.');
  const message = 'Generate PANDU Encryption Key';
  const signature = (await window.ethereum.request({
    method: 'personal_sign',
    params: [message, account],
  })) as string;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signature),
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
 * - plaintextSha256: Hash dari berkas asli (untuk bukti canonical)
 */
export async function encryptFileClient(
  file: File,
  key: CryptoKey
): Promise<{ payload: Uint8Array; ciphertextSha256: string; plaintextSha256: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBytes = await file.arrayBuffer();
  const plaintextSha256 = await sha256Hex(fileBytes);

  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBytes);

  const payload = new Uint8Array(iv.length + ciphertext.byteLength);
  payload.set(iv);
  payload.set(new Uint8Array(ciphertext), iv.length);

  const ciphertextSha256 = await sha256Hex(payload);

  return { payload, ciphertextSha256, plaintextSha256 };
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
