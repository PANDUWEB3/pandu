import { useEffect } from 'react';
import { supabase } from '../supabase';
import LoginModal from './LoginModal';
import { connectWalletLogin, startGoogleLogin, type WalletProvider } from './auth';

export default function Login() {
  const provider: WalletProvider = { id: 'metamask', label: 'MetaMask', getProvider: () => window.ethereum };
  useEffect(() => {
    let active = true;
    void supabase?.auth.getSession().then(({ data }) => { if (active && data.session) window.location.replace('/workspace'); });
    return () => { active = false; };
  }, []);
  return <main className="lp min-h-screen grid place-items-center bg-mist"><LoginModal open onClose={() => window.location.replace('/')} providers={[provider]} onGoogle={() => startGoogleLogin(supabase)} onConnect={item => connectWalletLogin(supabase, item)} /></main>;
}
