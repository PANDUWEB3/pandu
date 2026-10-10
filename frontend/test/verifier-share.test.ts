import { describe, it, expect } from 'vitest';
import {
  encryptFileEnvelope,
  decryptFileClient,
  exportDekRaw,
} from '../src/crypto';
import {
  generateVerifierKeyPair,
  exportVerifierPublicKey,
  exportVerifierPrivateKey,
  importVerifierPublicKey,
  importVerifierPrivateKey,
  wrapDekForVerifier,
  unwrapDekForVerifier,
  buildVerifierSharePayload,
  serializeVerifierShareFragment,
  parseVerifierShareFragment,
  buildVerifierShareUrl,
  importSharedDek,
  base64UrlEncode,
  base64UrlDecode,
  VERIFIER_SHARE_ALG,
} from '../src/verifier-share';

const fileContent = new TextEncoder().encode(
  'Laporan uji tekan beton K-400: 42.5 MPa pada umur 28 hari. Hasil PASS.'
);

describe('Berbagi akses verifikator: tautan berisi DEK (bearer, satu bukti)', () => {
  it('DEK hasil envelope dapat dibagikan lewat fragmen URL lalu membuka berkas', async () => {
    const { payload, wrappedKeyMeta, dek } = await encryptFileEnvelope(fileContent, {
      recoveryPassphrase: 'pandu-share-2026',
    });
    const rawDek = await exportDekRaw(dek);

    const sharePayload = buildVerifierSharePayload({
      mode: 'dek',
      proofId: 'PANDU-8F3A19B2',
      entries: [{ cid: 'bafybeiexample', dek: base64UrlEncode(rawDek) }],
    });
    const url = buildVerifierShareUrl('https://pandu.id/verify/token-abc', sharePayload);
    expect(url).toContain('#k=');
    // Fragmen tidak pernah dikirim ke server: path URL tetap bersih
    expect(url.split('#')[0]).toBe('https://pandu.id/verify/token-abc');

    const parsed = parseVerifierShareFragment(url.slice(url.indexOf('#')));
    expect(parsed).not.toBeNull();
    expect(parsed!.mode).toBe('dek');
    expect(parsed!.proofId).toBe('PANDU-8F3A19B2');

    const sharedDek = await importSharedDek((parsed!.entries as any)[0].dek);
    const { decryptedBytes } = await decryptFileClient(payload, sharedDek);
    expect(new TextDecoder().decode(decryptedBytes)).toBe(new TextDecoder().decode(fileContent));

    // Tautan berbagi TIDAK memuat frasa sandi pemulihan maupun bungkus recovery
    const fragmentJson = Buffer.from(
      url.slice(url.indexOf('#') + 3).replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8');
    expect(fragmentJson).not.toContain('recovery');
    expect(fragmentJson).not.toContain('pandu-share-2026');
    expect(wrappedKeyMeta.wrappedBy.recovery).toBeDefined();
  });

  it('menolak fragmen rusak / salah mode', () => {
    expect(parseVerifierShareFragment('')).toBeNull();
    expect(parseVerifierShareFragment('#x=abc')).toBeNull();
    expect(parseVerifierShareFragment('#k=!!invalid-base64url!!')).toBeNull();
    expect(parseVerifierShareFragment('#k=')).toBeNull();

    const payload = buildVerifierSharePayload({ mode: 'dek', entries: [{ dek: 'AAAA' }] });
    const fragment = serializeVerifierShareFragment(payload);
    // Mode pada payload harus cocok dengan penanda fragmen (k vs w)
    expect(parseVerifierShareFragment(fragment)).not.toBeNull();
    const forged = fragment.replace('#k=', '#w=');
    expect(parseVerifierShareFragment(forged)).toBeNull();
  });

  it('membangun payload minimal satu DEK', () => {
    expect(() => buildVerifierSharePayload({ mode: 'dek', entries: [] })).toThrow(/minimal satu DEK/);
  });
});

describe('Berbagi akses verifikator: ECIES ke kunci publik verifikator', () => {
  it('DEK hanya dapat dibuka oleh kunci privat verifikator yang cocok', async () => {
    const { payload, dek: fileDek } = await encryptFileEnvelope(fileContent, {
      recoveryPassphrase: 'pandu-ecies-2026',
    });
    const rawDek = await exportDekRaw(fileDek);

    const verifier = await generateVerifierKeyPair();
    const verifierPubHex = await exportVerifierPublicKey(verifier.publicKey);
    const verifierPrivHex = await exportVerifierPrivateKey(verifier.privateKey);

    const issuerSidePub = await importVerifierPublicKey(verifierPubHex);
    const wrap = await wrapDekForVerifier(rawDek, issuerSidePub);
    expect(wrap.alg).toBe(VERIFIER_SHARE_ALG);
    expect(wrap.v).toBe(1);
    expect(wrap.epk).toMatch(/^[0-9a-f]+$/);

    const sharePayload = buildVerifierSharePayload({
      mode: 'ecies',
      proofId: 'PANDU-8F3A19B2',
      entries: [{ cid: 'bafybeiexample', wrap }],
    });
    const fragment = serializeVerifierShareFragment(sharePayload);
    const parsed = parseVerifierShareFragment(fragment);
    expect(parsed!.mode).toBe('ecies');

    const verifierPriv = await importVerifierPrivateKey(verifierPrivHex);
    const dek = await unwrapDekForVerifier((parsed!.entries as any)[0].wrap, verifierPriv);
    const { decryptedBytes } = await decryptFileClient(payload, dek);
    expect(new TextDecoder().decode(decryptedBytes)).toBe(new TextDecoder().decode(fileContent));
    expect(payload.length).toBeGreaterThan(12);
  });

  it('kunci privat yang salah tidak dapat membuka bungkus DEK', async () => {
    const rawDek = crypto.getRandomValues(new Uint8Array(32));
    const verifier = await generateVerifierKeyPair();
    const other = await generateVerifierKeyPair();

    const wrap = await wrapDekForVerifier(rawDek, await importVerifierPublicKey(await exportVerifierPublicKey(verifier.publicKey)));
    await expect(
      unwrapDekForVerifier(wrap, await importVerifierPrivateKey(await exportVerifierPrivateKey(other.privateKey)))
    ).rejects.toThrow();
  });

  it('menolak algoritma pembungkusan yang tidak dikenal', async () => {
    const verifier = await generateVerifierKeyPair();
    const wrap = await wrapDekForVerifier(crypto.getRandomValues(new Uint8Array(32)), verifier.publicKey);
    await expect(unwrapDekForVerifier({ ...wrap, alg: 'RSA-OAEP' }, verifier.privateKey)).rejects.toThrow(
      /tidak didukung/
    );
  });
});

describe('Utilitas base64url', () => {
  it('round-trip untuk panjang byte acak', () => {
    for (const length of [1, 15, 16, 31, 32, 33]) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(Array.from(base64UrlDecode(base64UrlEncode(bytes)))).toEqual(Array.from(bytes));
    }
  });
});
