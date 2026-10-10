import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acceptMemberInvitation, computeBlindIndex, createMemberInvitation, decryptField, encodeFieldAad, encryptField,
  generateOrganizationDataKey, reencryptFieldForKeyRotation, unwrapOrganizationDataKey,
  unwrapOrganizationDataKeyWithRecovery, wrapOrganizationDataKey, wrapOrganizationDataKeyWithRecovery,
} from '../src/dbcrypto';

const context = { organizationId: 'org-a', table: 'inspections', rowId: 'row-1', column: 'measurements' };
const aadVector = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-vectors/dbcrypto-aad-vectors.json'), 'utf8'));

beforeAll(() => {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto API dibutuhkan untuk tes dbcrypto.');
});

describe('client database envelope AES-256-GCM', () => {
  it('mempertahankan test vector AAD kanonikal', () => {
    const actualHex = encodeFieldAad(aadVector.context, aadVector.kid);
    const actual = new TextDecoder().decode(Uint8Array.from(actualHex.match(/.{2}/g)!, (byte) => parseInt(byte, 16)));
    expect(actual).toBe(aadVector.canonicalAad);
  });

  it('roundtrip dan mengikat AAD ke organisasi, tabel, baris, kolom, serta kid', async () => {
    const key = generateOrganizationDataKey();
    const value = { moisture: '11.20', private: true };
    const envelope = await encryptField(value, key, 'org-a-v1', context);
    await expect(decryptField(envelope, key, context)).resolves.toEqual(value);
    await expect(decryptField(envelope, key, { ...context, rowId: 'row-2' })).rejects.toThrow();
    await expect(decryptField(envelope, key, { ...context, organizationId: 'org-b' })).rejects.toThrow();
    await expect(decryptField({ ...envelope, kid: 'org-a-v2' }, key, context)).rejects.toThrow();
  });

  it('menolak ciphertext yang diubah dan pertukaran ciphertext antar baris', async () => {
    const key = generateOrganizationDataKey();
    const first = await encryptField('contoh-rahasia-satu', key, 'kid-1', context);
    const second = await encryptField('contoh-rahasia-dua', key, 'kid-1', { ...context, rowId: 'row-2' });
    const altered = { ...first, data: `${first.data.slice(0, -4)}AAAA` };
    await expect(decryptField(altered, key, context)).rejects.toThrow();
    await expect(decryptField(second, key, context)).rejects.toThrow();
  });

  it('menggunakan IV acak unik dan memutar kid dengan ciphertext baru', async () => {
    const oldKey = generateOrganizationDataKey();
    const newKey = generateOrganizationDataKey();
    const a = await encryptField('nilai', oldKey, 'kid-1', context);
    const b = await encryptField('nilai', oldKey, 'kid-1', context);
    expect(a.iv).not.toBe(b.iv);
    const rotated = await reencryptFieldForKeyRotation(a, oldKey, newKey, 'kid-2', context);
    expect(rotated.kid).toBe('kid-2');
    expect(rotated.iv).not.toBe(a.iv);
    await expect(decryptField(rotated, newKey, context)).resolves.toBe('nilai');
    await expect(decryptField(rotated, oldKey, context)).rejects.toThrow();
  });

  it('membungkus ODK dengan KEK, recovery PBKDF2, dan envelope undangan ECDH', async () => {
    const dataKey = generateOrganizationDataKey();
    const kek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const wrapped = await wrapOrganizationDataKey(dataKey, kek, 'kid-1');
    expect(Array.from(await unwrapOrganizationDataKey(wrapped, kek))).toEqual(Array.from(dataKey));
    const recovery = await wrapOrganizationDataKeyWithRecovery(dataKey, 'recovery-phrase-2026', 'kid-1');
    expect(recovery.iterations).toBe(600_000);
    expect(Array.from(await unwrapOrganizationDataKeyWithRecovery(recovery, 'recovery-phrase-2026'))).toEqual(Array.from(dataKey));
    await expect(unwrapOrganizationDataKeyWithRecovery(recovery, 'different-phrase-2026')).rejects.toThrow();

    const recipient = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const invitation = await createMemberInvitation(dataKey, await crypto.subtle.exportKey('jwk', recipient.publicKey), 'kid-1');
    expect(Array.from(await acceptMemberInvitation(invitation, recipient.privateKey))).toEqual(Array.from(dataKey));
  });

  it('memisahkan blind index dari kunci data dan menolak kunci yang salah ukuran', async () => {
    const key = generateOrganizationDataKey();
    expect(await computeBlindIndex(' Supplier A ', key)).toBe(await computeBlindIndex('supplier a', key));
    await expect(computeBlindIndex('x', new Uint8Array(16))).rejects.toThrow();
  });
});
