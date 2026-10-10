import { MotionConfig } from 'motion/react';
import Navbar from './Navbar';
import Hero from './Hero';
import IndustriesBar from './IndustriesBar';
import HowItWorks from './HowItWorks';
import Features from './Features';
import FinalCTA from './FinalCTA';
import Footer from './Footer';

export default function Landing() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="lp min-h-screen">
        <Navbar />
        <main>
          <Hero />
          <IndustriesBar />
          <HowItWorks />
          <Features />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
