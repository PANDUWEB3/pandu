import { describe, expect, it } from 'vitest';
import { walletSignInUrl } from '../src/landing/auth';

describe('walletSignInUrl', () => {
  it('maps the Vite loopback IP to the SIWE-valid localhost hostname', () => {
    expect(walletSignInUrl('http://127.0.0.1:5173')).toBe('http://localhost:5173/');
  });

  it('keeps valid production hostnames and ports', () => {
    expect(walletSignInUrl('https://app.pandu.example:8443')).toBe('https://app.pandu.example:8443/');
  });

  it('rejects raw IP addresses that Supabase SIWE cannot parse as domains', () => {
    expect(() => walletSignInUrl('http://192.168.1.20:5173')).toThrow('WALLET_DOMAIN_INVALID');
  });
});
