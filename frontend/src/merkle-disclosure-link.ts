import { MERKLE_VERSION, type DisclosurePackage } from './merkle';

function encode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid disclosure fragment.');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Merkle salts and disclosed values stay in the URL fragment; browsers do not send fragments to the server. */
export function buildMerkleDisclosureFragment(disclosure: DisclosurePackage): string {
  if (disclosure.version !== MERKLE_VERSION || disclosure.disclosed.length === 0) throw new Error('Disclosure package is empty or unsupported.');
  return `#d=${encode(new TextEncoder().encode(JSON.stringify(disclosure)))}`;
}

export function parseMerkleDisclosureFragment(hash: string): DisclosurePackage | null {
  const match = hash.match(/^#d=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode(match[1]))) as DisclosurePackage;
    if (parsed.version !== MERKLE_VERSION || typeof parsed.root !== 'string' || !Array.isArray(parsed.disclosed) || parsed.disclosed.length === 0) return null;
    if (parsed.disclosed.some((item) => typeof item.path !== 'string' || typeof item.salt !== 'string' || !Array.isArray(item.auditPath))) return null;
    return parsed;
  } catch {
    return null;
  }
}
