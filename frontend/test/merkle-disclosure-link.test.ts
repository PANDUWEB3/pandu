import { describe, expect, it } from 'vitest';
import { buildMerkleDisclosureFragment, parseMerkleDisclosureFragment } from '../src/merkle-disclosure-link';
import { buildDisclosurePackage, type MerkleLeaf } from '../src/merkle';

describe('browser-only disclosure fragment', () => {
  it('roundtrips an issuer-selected disclosure and rejects malformed payloads', async () => {
    const leaves: MerkleLeaf[] = [
      { path: 'supplier', value: 'PT Contoh', salt: '11'.repeat(32) },
      { path: 'inspection.result', value: 'PASS', salt: '22'.repeat(32) },
    ];
    const pkg = await buildDisclosurePackage(leaves, ['inspection.result']);
    const fragment = buildMerkleDisclosureFragment(pkg);
    expect(fragment.startsWith('#d=')).toBe(true);
    expect(parseMerkleDisclosureFragment(fragment)).toEqual(pkg);
    expect(parseMerkleDisclosureFragment('#d=%%')).toBeNull();
    expect(parseMerkleDisclosureFragment('#k=YWJj')).toBeNull();
  });
});
