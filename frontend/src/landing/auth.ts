import type { SupabaseClient } from '@supabase/supabase-js';

export type Eip1193Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown>; on?: (event: string, listener: (...args: unknown[]) => void) => void; removeListener?: (event: string, listener: (...args: unknown[]) => void) => void };
export type WalletProvider = { id: 'metamask'; label: 'MetaMask'; getProvider: () => Eip1193Provider | undefined };

const siweDomainPattern = /^(localhost|(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})(?::\d{1,5})?$/;

export function walletSignInUrl(origin: string): string {
  const url = new URL(origin);
  if (url.hostname === '127.0.0.1' || url.hostname === '0.0.0.0' || url.hostname === '[::1]') url.hostname = 'localhost';
  if (!siweDomainPattern.test(url.host)) throw new Error('WALLET_DOMAIN_INVALID');
  return `${url.origin}/`;
}

export async function startGoogleLogin(client: SupabaseClient | null) {
  if (!client) throw new Error('Supabase is not configured.');
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/workspace`, queryParams: { prompt: 'select_account' } } });
  if (error) throw error;
}

export async function requestWallet(provider: WalletProvider): Promise<string> {
  const wallet = provider.getProvider();
  if (!wallet) throw new Error('WALLET_NOT_INSTALLED');
  const accounts = await wallet.request({ method: 'eth_requestAccounts' }) as string[];
  if (!accounts?.length) throw new Error('WALLET_REJECTED');
  return accounts[0];
}

export async function signInWithWallet(client: SupabaseClient | null, provider?: WalletProvider, address?: string) {
  if (!client) throw new Error('Supabase is not configured.');
  const url = walletSignInUrl(window.location.origin);
  const walletProvider = provider?.getProvider();
  const wallet = walletProvider && address ? {
    address,
    request: walletProvider.request.bind(walletProvider),
    on: walletProvider.on?.bind(walletProvider) || (() => {}),
    removeListener: walletProvider.removeListener?.bind(walletProvider) || (() => {}),
  } : undefined;
  const credentials = { chain: 'ethereum', wallet: wallet as never, statement: 'Sign in to PANDU Workspace', options: { url } } as Parameters<SupabaseClient['auth']['signInWithWeb3']>[0];
  const { error } = await client.auth.signInWithWeb3(credentials);
  if (error) throw error;
}

export async function connectWalletLogin(client: SupabaseClient | null, provider: WalletProvider) {
  walletSignInUrl(window.location.origin);
  const address = await requestWallet(provider);
  await signInWithWallet(client, provider, address);
}
