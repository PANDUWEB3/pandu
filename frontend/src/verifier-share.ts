/**
 * PANDU Berbagi Akses Verifikator (per bukti / per berkas)
 *
 * Dua mode pengiriman DEK ke verifikator pihak ketiga:
 * 1. SHARE-LINK (bearer): fragmen URL berisi DEK mentah untuk SATU bukti.
 *    Fragmen (#...) tidak pernah dikirim ke server, jadi DEK tidak meninggalkan
 *    peramban penerbit maupun verifikator.
 * 2. ECIES KUNCI PUBLIK VERIFIKATOR: DEK dibungkus ke kunci publik P-256 milik
 *    verifikator (ECDH -> HKDF-SHA256 -> AES-256-GCM). Hanya verifikator pemegang
 *    kunci privat yang dapat membuka.
 *
 * FRASA SANDI PEMULIHAN TIDAK PERNAH dipakai untuk berbagi akses pihak ketiga.
 * Frasa sandi hanya untuk pemulihan milik penerbit sendiri.
 */
import { bytesToHex, hexToBytes, importDek, wrapDek, unwrapDek, type WrappedKeyEntry } from './crypto';
import type { DisclosurePackage } from './merkle';
export { exportDekRaw } from './crypto';

export type VerifierShareMode = 'dek' | 'ecies';

export interface VerifierShareEntryPlain {
  cid?: string;
  /** DEK 32 byte, base64url */
  dek: string;
}

export interface VerifierShareEntryWrapped {
  cid?: string;
  wrap: WrappedKeyEntry & { epk: string; alg: string; v: 1 };
}

export interface VerifierSharePayload {
  v: 1;
  mode: VerifierShareMode;
  proofId?: string;
  entries: VerifierShareEntryPlain[] | VerifierShareEntryWrapped[];
  disclosure?: DisclosurePackage;
}

export const VERIFIER_SHARE_ALG = 'ECDH-P256+HKDF-SHA256+AES-256-GCM';
const HKDF_SALT = new TextEncoder().encode('PANDU-VERIFIER-SHARE-SALT-v1');
const HKDF_INFO = new TextEncoder().encode('PANDU-VERIFIER-DEK-WRAP-v1');

/** Uint8Array -> base64url tanpa padding */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url -> Uint8Array */
export function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ *
 * Kunci verifikator (P-256 ECDH)
 * ------------------------------------------------------------------ */

export async function generateVerifierKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
}

/** SPKI DER (SubjectPublicKeyInfo) sebagai hex — format yang dibagikan ke penerbit. */
export async function exportVerifierPublicKey(publicKey: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return bytesToHex(new Uint8Array(spki));
}

export async function importVerifierPublicKey(publicKeyHex: string): Promise<CryptoKey> {
  const spki = hexToBytes(publicKeyHex.trim());
  return await crypto.subtle.importKey('spki', spki, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

/** PKCS#8 DER sebagai hex — disimpan lokal di peramban verifikator, tidak pernah dibagikan. */
export async function exportVerifierPrivateKey(privateKey: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  return bytesToHex(new Uint8Array(pkcs8));
}

export async function importVerifierPrivateKey(privateKeyHex: string): Promise<CryptoKey> {
  const pkcs8 = hexToBytes(privateKeyHex.trim());
  return await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ]);
}

async function hkdfExpand(ikm: Uint8Array, info: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** ECDH(eph, verifierPub) -> HKDF-SHA256 -> AES-256-GCM membungkus DEK. */
export async function wrapDekForVerifier(
  rawDek: Uint8Array,
  verifierPublicKey: CryptoKey
): Promise<VerifierShareEntryWrapped['wrap']> {
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
    'deriveBits',
  ]);
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: verifierPublicKey },
    ephemeral.privateKey,
    256
  );
  const kek = await hkdfExpand(new Uint8Array(sharedSecret), HKDF_INFO);
  const wrapped = await wrapDek(rawDek, kek);
  const epk = await exportVerifierPublicKey(ephemeral.publicKey);
  return { ...wrapped, epk, alg: VERIFIER_SHARE_ALG, v: 1 };
}

export async function unwrapDekForVerifier(
  wrap: VerifierShareEntryWrapped['wrap'],
  verifierPrivateKey: CryptoKey
): Promise<CryptoKey> {
  if (wrap.alg !== VERIFIER_SHARE_ALG) throw new Error(`Algoritma pembungkusan tidak didukung: ${wrap.alg}`);
  const ephemeralPublic = await importVerifierPublicKey(wrap.epk);
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephemeralPublic },
    verifierPrivateKey,
    256
  );
  const kek = await hkdfExpand(new Uint8Array(sharedSecret), HKDF_INFO);
  return await unwrapDek({ iv: wrap.iv, ciphertext: wrap.ciphertext }, kek);
}

/* ------------------------------------------------------------------ *
 * Payload & fragmen URL
 * ------------------------------------------------------------------ */

export function buildVerifierSharePayload(options: {
  mode: VerifierShareMode;
  proofId?: string;
  entries: VerifierShareEntryPlain[] | VerifierShareEntryWrapped[];
  disclosure?: DisclosurePackage;
}): VerifierSharePayload {
  if (options.entries.length === 0 && !options.disclosure) {
    throw new Error('Payload harus memuat DEK bukti atau selective disclosure.');
  }
  return { v: 1, mode: options.mode, proofId: options.proofId, entries: options.entries, disclosure: options.disclosure };
}

/** Serialisasi payload ke fragmen URL: `#k=...` (bearer) atau `#w=...` (ECIES). */
export function serializeVerifierShareFragment(payload: VerifierSharePayload): string {
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return `#${payload.mode === 'ecies' ? 'w' : 'k'}=${encoded}`;
}

/** Parse fragmen URL halaman verifikasi. Mengembalikan null jika tidak ada / tidak valid. */
export function parseVerifierShareFragment(hash: string): VerifierSharePayload | null {
  if (!hash || hash.length < 3) return null;
  const match = hash.match(/^#(k|w)=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(match[2]));
    const payload = JSON.parse(json) as VerifierSharePayload;
    if (payload?.v !== 1 || !Array.isArray(payload.entries) || (payload.entries.length === 0 && !payload.disclosure)) return null;
    const expectedMode: VerifierShareMode = match[1] === 'w' ? 'ecies' : 'dek';
    if (payload.mode !== expectedMode) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Bangun tautan verifikasi untuk SATU bukti berisi DEK (bearer link). */
export function buildVerifierShareUrl(baseUrl: string, payload: VerifierSharePayload): string {
  return `${baseUrl.replace(/#.*$/, '')}${serializeVerifierShareFragment(payload)}`;
}

/** Dekripsi langsung memakai DEK mentah dari tautan berbagi. */
export async function importSharedDek(base64urlDek: string): Promise<CryptoKey> {
  const bytes = base64UrlDecode(base64urlDek);
  if (bytes.length !== 32) throw new Error('DEK pada tautan berbagi tidak valid (bukan 32 byte).');
  return await importDek(bytes);
}
