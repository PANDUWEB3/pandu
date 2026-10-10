import { useState } from 'react';
import { MotionConfig } from 'motion/react';
import Navbar from './Navbar';
import Hero from './Hero';
import IndustriesBar from './IndustriesBar';
import HowItWorks from './HowItWorks';
import Features from './Features';
import FinalCTA from './FinalCTA';
import Footer from './Footer';
import LoginModal from './LoginModal';
import { startGoogleLogin, connectWalletLogin, type WalletProvider } from './auth';
import { supabase } from '../supabase';

export default function Landing() {
  const [loginOpen, setLoginOpen] = useState(false);
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
          <HowItWorks />
          <Features />
          <FinalCTA onGetStarted={() => setLoginOpen(true)} />
        </main>
        <Footer />
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} providers={providers}
        onGoogle={() => startGoogleLogin(supabase)} onConnect={provider => connectWalletLogin(supabase, provider)} />
    </MotionConfig>
  );
}
