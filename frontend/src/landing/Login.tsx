import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, LockKeyhole, Mail, ArrowRight } from 'lucide-react';
import { useI18n } from '../i18n';
import { supabase } from '../supabase';
import Navbar from './Navbar';
import Footer from './Footer';
import { Logo } from './ui';
import { requestWallet, signInWithWallet, startGoogleLogin } from './auth';

function MetaMaskIcon({ className }: { className?: string }) {
  return (
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAvVBMVEVHcEyRLAj/7jv/zW9iFgC3PQ3/YhleFABoGQBmGABWDgC9Rhj/YBfsTgtmGAD/XBT/XBbRSBBmGAD/kmNmGAD+YyT/j1//jV3jSAf+bzVOAADcbED/kGBmGACtNwhiEwBfEADsUAqoTzCrUTL/kF/8e0f9VQjkRgHiQQD/jV35hFjvYy9JAACoLQT/jV3/j1/hQgDfPwDjSAe5fG/iPgDwrqLl7fjQzdaFYV/m7/zo7PfBx9Ho7Pfd4Ou/w8x1PRztAAAAP3RSTlMATwMB4v9g6AX////aKU3/oP+OJuf//////////yT/7///mf/S/////0j/////mOrh/4j/nZv///8j2P/ZXY4JiVg0AAABNklEQVR4AbXRVYKDQBAEUOLBZcM00nF3d7n/sbYn07Dyn0JrHo72wRSK/0dKhXy3XKn+tWqllu3WdcO07B+yLdPQ61wcndT1MvNc39B1h1ugk/quW/2iVN236QFjQ1caCgARKtMbjGX9rVEsMY7IGPmyMkmKAJgmqgWMTXVmS53ZUmc2NU670+noXTeUZ4ZuV6faVkLp9fumS5HoUsx+v5fjAHFIYyOgjGhniDjIEUAMu+NoMgQYTqJxdygASmxTAJjNW4tlLMRwuVjOZzQwZVwBBXGWzhHn6QxR9hXjGmUE4FyIOYJAmTXjZkLZhoBDpBnCrewbxl0kM3KHkKYwdEfvumO0FY5m+yTZw0hh/n9lORxPp/Plcj6djgfZtSy7nTzuejvd76fHVV5rt9P+5/l6PbXP5xsBZCbyHVTHFAAAAABJRU5ErkJggg==" alt="MetaMask" className={className} />
  );
}

export default function Login() {
  const { t } = useI18n();
  
  const [note, setNote] = useState('');
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoDomain, setSsoDomain] = useState('');
  
  const [wallet, setWallet] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);

  async function googleLogin() {
    setNote(t.login.connecting);
    try { await startGoogleLogin(supabase); }
    catch (error: any) { setNote(`${t.login.failed}${error.message || t.login.notConfigured}`); }
  }

  async function ssoLogin(e: React.FormEvent) {
    e.preventDefault();
    const domain = ssoDomain.trim();
    if (!domain) { setNote(t.login.ssoEmpty); return; }
    if (!supabase) { setNote(t.login.notConfigured); return; }
    setNote(t.login.connecting);
    const { error } = await supabase.auth.signInWithSSO({ domain, options: { redirectTo: `${window.location.origin}/workspace` } });
    if (error) setNote(`${t.login.failed}${error.message}`);
  }

  async function connectWallet() {
    setNote('');
    setWalletLoading(true);
    try {
      const account = await requestWallet({ id: 'metamask', label: 'MetaMask', getProvider: () => window.ethereum });
      setWallet(account);
    } catch (err: any) {
      if (err.code === 4001 || err.message === 'WALLET_REJECTED') setNote(t.login.mmRejected);
      else if (err.message === 'WALLET_NOT_INSTALLED') setNote(t.login.mmMissing);
      else setNote(err.message || 'Error connecting wallet');
    } finally {
      setWalletLoading(false);
    }
  }

  async function continueWithWallet() {
    setNote(t.login.connecting || 'Connecting...');
    setWalletLoading(true);
    try {
      await signInWithWallet(supabase, { id: 'metamask', label: 'MetaMask', getProvider: () => window.ethereum }, wallet);
      window.location.href = '/workspace';
    } catch (err: any) {
      setNote(err.message || 'Error authenticating with wallet');
    } finally {
      setWalletLoading(false);
    }
  }

  return (
    <div className="lp min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center p-6 pt-32 pb-24 relative overflow-hidden">
        
        {/* Background Decorative Blur */}
        <div className="absolute top-1/2 left-1/2 w-[800px] h-[800px] bg-brand/5 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-md w-full bg-white dark:bg-slate-900 border border-black/5 dark:border-white/10 rounded-3xl shadow-xl p-8 relative z-10"
        >
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6 scale-110">
              <Logo />
            </div>
            <p className="text-sm font-semibold tracking-wider text-brand mb-2 uppercase">{t.login.kicker}</p>
            <h1 className="text-3xl font-bold tracking-tight mb-3">{t.login.title}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-base">{t.login.sub}</p>
          </div>

          {!ssoMode ? (
            <div className="space-y-4">
              <button 
                onClick={() => void googleLogin()}
                className="w-full flex items-center justify-center gap-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium py-3.5 px-4 rounded-xl transition-colors border border-transparent"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.86C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.86z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.86c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                {t.login.google}
              </button>
              
              <button 
                onClick={() => setSsoMode(true)}
                className="w-full flex items-center justify-center gap-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium py-3.5 px-4 rounded-xl transition-colors border border-transparent"
              >
                <Mail size={18} />
                {t.login.sso}
              </button>

              <div className="flex items-center gap-4 py-3">
                <hr className="flex-1 border-black/5 dark:border-white/10" />
                <span className="text-sm text-slate-400">{t.login.or}</span>
                <hr className="flex-1 border-black/5 dark:border-white/10" />
              </div>

              {!wallet ? (
                <button 
                  onClick={connectWallet}
                  disabled={walletLoading}
                  className="w-full flex items-center justify-center gap-3 bg-orange-500 text-white font-medium py-3.5 px-4 rounded-xl hover:bg-orange-600 transition-colors shadow-sm hover:shadow-md"
                >
                  <MetaMaskIcon className="w-5 h-5" />
                  {walletLoading ? t.login.mmConnecting : t.login.metamask}
                </button>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/50 rounded-xl p-4 flex flex-col gap-3 overflow-hidden"
                >
                  <div className="flex items-center gap-3 text-brand">
                    <MetaMaskIcon className="w-5 h-5 shrink-0" />
                    <span className="font-medium text-sm truncate">{wallet}</span>
                  </div>
                  <button onClick={continueWithWallet} disabled={walletLoading} className="w-full bg-orange-500 text-white font-medium py-2.5 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {walletLoading ? t.login.mmConnecting : t.login.mmContinue}
                  </button>
                  <button onClick={() => setWallet('')} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 text-center mt-1">
                    {t.login.mmChange}
                  </button>
                </motion.div>
              )}
            </div>
          ) : (
            <motion.form 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={ssoLogin} 
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-slate-200 mb-1">{t.login.ssoLabel}</label>
                <input 
                  type="text" 
                  value={ssoDomain}
                  onChange={e => setSsoDomain(e.target.value)}
                  placeholder={t.login.ssoPlaceholder}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border-transparent focus:bg-white dark:focus:bg-slate-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all text-slate-900 dark:text-slate-100 shadow-inner"
                  autoFocus
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t.login.ssoHint}</p>
              </div>
              <button 
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-orange-500 text-white font-medium py-3.5 px-4 rounded-xl hover:bg-orange-600 transition-colors shadow-sm hover:shadow-md"
              >
                {t.login.ssoGo} <ArrowRight size={16} />
              </button>
              <button 
                type="button"
                onClick={() => setSsoMode(false)}
                className="w-full text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 py-2 transition-colors"
              >
                Batal
              </button>
            </motion.form>
          )}

          {note && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-orange-50 border border-orange-100 dark:bg-orange-900/20 dark:border-orange-900/30 rounded-xl text-orange-700 dark:text-orange-400 text-sm flex items-start gap-3"
            >
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              <p>{note}</p>
            </motion.div>
          )}

          <div className="mt-8 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 justify-center">
            <LockKeyhole size={14} />
            <p>{t.login.legal}</p>
          </div>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
