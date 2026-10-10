/** Client-only field encryption for PANDU database values. */
import { canonicalJson, bytesToHex, hexToBytes } from './crypto';

export const DB_ENVELOPE_VERSION = 1 as const;
export const DB_ENVELOPE_ALGORITHM = 'A256GCM' as const;
export const DB_RECOVERY_ITERATIONS = 600_000;
export const DB_MIN_RECOVERY_PASSPHRASE_LENGTH = 12;

export interface FieldContext {
  organizationId: string;
  table: string;
  rowId: string;
  column: string;
}

export interface DbCiphertextEnvelope {
  v: typeof DB_ENVELOPE_VERSION;
  alg: typeof DB_ENVELOPE_ALGORITHM;
  kid: string;
  iv: string;
  data: string;
  aad: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function contextAad(context: FieldContext, kid: string): string {
  for (const [key, value] of Object.entries(context)) {
    if (!value || typeof value !== 'string') throw new Error(`Konteks enkripsi tidak valid: ${key}`);
  }
  return canonicalJson({ organization_id: context.organizationId, table: context.table, row_id: context.rowId, column: context.column, kid });
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importAesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  if (raw.byteLength !== 32) throw new Error('Kunci AES harus 256 bit.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages);
}

function assertAes256GcmKey(key: CryptoKey): void {
  const algorithm = key.algorithm as AesKeyAlgorithm;
  if (algorithm.name !== 'AES-GCM' || algorithm.length !== 256) throw new Error('KEK harus AES-256-GCM.');
}

/** Generate an organization data key in the browser. Keep the returned bytes in session memory only. */
export function generateOrganizationDataKey(): Uint8Array {
  return randomBytes(32);
}

export async function encryptField<T>(value: T, organizationDataKey: Uint8Array, kid: string, context: FieldContext): Promise<DbCiphertextEnvelope> {
  if (!kid || kid.length > 128) throw new Error('kid tidak valid.');
  const aad = contextAad(context, kid);
  const iv = randomBytes(12);
  const key = await importAesKey(organizationDataKey, ['encrypt']);
  const plaintext = encoder.encode(canonicalJson(value));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad), tagLength: 128 }, key, plaintext);
  return { v: DB_ENVELOPE_VERSION, alg: DB_ENVELOPE_ALGORITHM, kid, iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)), aad };
}

export async function decryptField<T>(envelope: DbCiphertextEnvelope, organizationDataKey: Uint8Array, context: FieldContext): Promise<T> {
  if (!isDbCiphertextEnvelope(envelope)) throw new Error('Envelope ciphertext tidak valid.');
  const expectedAad = contextAad(context, envelope.kid);
  if (envelope.aad !== expectedAad) throw new Error('Konteks enkripsi tidak cocok.');
  const iv = fromBase64(envelope.iv);
  const data = fromBase64(envelope.data);
  if (iv.byteLength !== 12 || data.byteLength < 16) throw new Error('Envelope ciphertext tidak valid.');
  const key = await importAesKey(organizationDataKey, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(expectedAad), tagLength: 128 }, key, data);
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function isDbCiphertextEnvelope(value: unknown): value is DbCiphertextEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<DbCiphertextEnvelope>;
  return envelope.v === DB_ENVELOPE_VERSION && envelope.alg === DB_ENVELOPE_ALGORITHM &&
    typeof envelope.kid === 'string' && envelope.kid.length > 0 &&
    typeof envelope.iv === 'string' && typeof envelope.data === 'string' && typeof envelope.aad === 'string';
}

export async function wrapOrganizationDataKey(dataKey: Uint8Array, kek: CryptoKey, kid: string): Promise<{ v: 1; alg: 'A256GCM'; kid: string; iv: string; data: string }> {
  if (dataKey.byteLength !== 32) throw new Error('ODK harus 256 bit.');
  assertAes256GcmKey(kek);
  const iv = randomBytes(12);
  const aad = encoder.encode(canonicalJson({ purpose: 'pandu-odk-envelope-v1', kid }));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, kek, dataKey);
  return { v: 1, alg: 'A256GCM', kid, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

export async function unwrapOrganizationDataKey(envelope: { v: 1; alg: 'A256GCM'; kid: string; iv: string; data: string }, kek: CryptoKey): Promise<Uint8Array> {
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('Envelope kunci tidak didukung.');
  assertAes256GcmKey(kek);
  const aad = encoder.encode(canonicalJson({ purpose: 'pandu-odk-envelope-v1', kid: envelope.kid }));
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: aad, tagLength: 128 }, kek, fromBase64(envelope.data));
  const key = new Uint8Array(raw);
  if (key.byteLength !== 32) throw new Error('ODK hasil unwrap tidak valid.');
  return key;
}

export function deriveRecoveryKek(passphrase: string, salt: Uint8Array, iterations = DB_RECOVERY_ITERATIONS): Promise<CryptoKey> {
  if (passphrase.length < DB_MIN_RECOVERY_PASSPHRASE_LENGTH) throw new Error('Frasa pemulihan harus minimal 12 karakter.');
  if (salt.byteLength < 16 || !Number.isInteger(iterations) || iterations < DB_RECOVERY_ITERATIONS) throw new Error('Parameter pemulihan tidak memenuhi minimum keamanan.');
  return crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']).then((material) =>
    crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
}

export async function wrapOrganizationDataKeyWithRecovery(dataKey: Uint8Array, passphrase: string, kid: string): Promise<{ v: 1; alg: 'A256GCM'; kid: string; iv: string; data: string; kdf: 'PBKDF2-SHA256'; salt: string; iterations: number }> {
  const salt = randomBytes(16);
  const kek = await deriveRecoveryKek(passphrase, salt);
  return { ...await wrapOrganizationDataKey(dataKey, kek, kid), kdf: 'PBKDF2-SHA256', salt: toBase64(salt), iterations: DB_RECOVERY_ITERATIONS };
}

export async function unwrapOrganizationDataKeyWithRecovery(envelope: { v: 1; alg: 'A256GCM'; kid: string; iv: string; data: string; kdf: 'PBKDF2-SHA256'; salt: string; iterations: number }, passphrase: string): Promise<Uint8Array> {
  if (envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations < DB_RECOVERY_ITERATIONS) throw new Error('Parameter KDF recovery tidak memenuhi minimum.');
  const kek = await deriveRecoveryKek(passphrase, fromBase64(envelope.salt), envelope.iterations);
  return unwrapOrganizationDataKey(envelope, kek);
}

/** ECDH P-256 invitation wrapper. The recipient's private key remains on their device. */
export async function createMemberInvitation(dataKey: Uint8Array, recipientPublicKey: JsonWebKey, kid: string): Promise<{ v: 1; alg: 'ECDH-P256+A256GCM'; kid: string; ephemeralPublicKey: JsonWebKey; iv: string; data: string }> {
  const recipient = await crypto.subtle.importKey('jwk', recipientPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  const wrappingKey = await crypto.subtle.deriveKey({ name: 'ECDH', public: recipient }, ephemeral.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = randomBytes(12);
  const aad = encoder.encode(canonicalJson({ purpose: 'pandu-member-invitation-v1', kid }));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, wrappingKey, dataKey);
  return { v: 1, alg: 'ECDH-P256+A256GCM', kid, ephemeralPublicKey: await crypto.subtle.exportKey('jwk', ephemeral.publicKey), iv: toBase64(iv), data: toBase64(new Uint8Array(data)) };
}

export async function acceptMemberInvitation(invitation: { v: 1; alg: 'ECDH-P256+A256GCM'; kid: string; ephemeralPublicKey: JsonWebKey; iv: string; data: string }, recipientPrivateKey: CryptoKey): Promise<Uint8Array> {
  if (invitation.v !== 1 || invitation.alg !== 'ECDH-P256+A256GCM') throw new Error('Undangan kunci tidak didukung.');
  const ephemeral = await crypto.subtle.importKey('jwk', invitation.ephemeralPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const wrappingKey = await crypto.subtle.deriveKey({ name: 'ECDH', public: ephemeral }, recipientPrivateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const aad = encoder.encode(canonicalJson({ purpose: 'pandu-member-invitation-v1', kid: invitation.kid }));
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(invitation.iv), additionalData: aad, tagLength: 128 }, wrappingKey, fromBase64(invitation.data));
  const key = new Uint8Array(raw);
  if (key.byteLength !== 32) throw new Error('ODK undangan tidak valid.');
  return key;
}

/** Decrypt under the retiring kid, then encrypt with a fresh IV and the new kid. */
export async function reencryptFieldForKeyRotation<T>(envelope: DbCiphertextEnvelope, oldKey: Uint8Array, newKey: Uint8Array, newKid: string, context: FieldContext): Promise<DbCiphertextEnvelope> {
  const value = await decryptField<T>(envelope, oldKey, context);
  return encryptField(value, newKey, newKid, context);
}

/** HMAC-SHA-256 blind index. Caller must provide a dedicated, non-ODK search key. */
export async function computeBlindIndex(value: string, dedicatedSearchKey: Uint8Array): Promise<string> {
  if (dedicatedSearchKey.byteLength !== 32) throw new Error('Kunci blind index harus 256 bit.');
  const key = await crypto.subtle.importKey('raw', dedicatedSearchKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(value.normalize('NFKC').trim().toLocaleLowerCase('en-US')));
  return bytesToHex(new Uint8Array(digest));
}

export function encodeFieldAad(context: FieldContext, kid: string): string { return bytesToHex(encoder.encode(contextAad(context, kid))); }
export function decodeHexForCrypto(hex: string): Uint8Array { return hexToBytes(hex); }
