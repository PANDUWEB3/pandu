import { useState } from 'react';
import { MotionConfig } from 'motion/react';
import Navbar from './Navbar';
import Hero from './Hero';
import IndustriesBar from './IndustriesBar';
import { useI18n } from '../i18n';
import { ArrowRight } from 'lucide-react';
import FinalCTA from './FinalCTA';
import Footer from './Footer';
import LoginModal from './LoginModal';
import { startGoogleLogin, connectWalletLogin, type WalletProvider } from './auth';
import { supabase } from '../supabase';

export default function Landing() {
  const [loginOpen, setLoginOpen] = useState(false);
  const { t, lang } = useI18n();
  const howPath = lang === 'en' ? '/how-it-works' : '/cara-kerja';
  const whoPath = lang === 'en' ? '/who-its-for' : '/untuk-siapa';
  const providers: WalletProvider[] = [
    { id: 'metamask', label: 'MetaMask', getProvider: () => window.ethereum },
  ];
  return (
    <MotionConfig reducedMotion="user">
      <div className="lp min-h-screen">
        <Navbar onGetStarted={() => setLoginOpen(true)} />
        <main>
          <Hero onGetStarted={() => setLoginOpen(true)} />
          <IndustriesBar />
          <section className="mx-auto max-w-6xl px-5 py-20 sm:py-24"><div className="rounded-3xl bg-mist p-8 text-center sm:p-12"><h2 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">{t.landingSummary.title}</h2><div className="mt-6 flex flex-wrap justify-center gap-3"><a href={howPath} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-white">{t.landingSummary.how}<ArrowRight size={16}/></a><a href={whoPath} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 bg-white px-5 py-3 font-semibold text-ink">{t.landingSummary.who}<ArrowRight size={16}/></a></div></div></section>
          <FinalCTA onGetStarted={() => setLoginOpen(true)} />
        </main>
        <Footer />
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} providers={providers}
        onGoogle={() => startGoogleLogin(supabase)} onConnect={provider => connectWalletLogin(supabase, provider)} />
    </MotionConfig>
  );
}
