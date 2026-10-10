import { ArrowRight, FileSearch } from 'lucide-react';
import BlurText from './reactbits/BlurText';
import { useI18n } from '../i18n';
import { Button, Reveal } from './ui';

export default function FinalCTA({ onGetStarted = () => { window.location.href = '/login'; } }: { onGetStarted?: () => void } = {}) {
  const { t, lang } = useI18n();
  return (
    <section className="px-3 py-20 sm:px-5 sm:py-28">
      <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] bg-panel px-6 py-20 text-center ring-1 ring-gray-200 sm:px-14 sm:py-28">
        <div className="absolute left-1/2 top-0 -z-10 h-72 w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/60 blur-[110px]" aria-hidden="true" />
        <div className="lp-grid absolute inset-0 -z-10 opacity-20 [filter:invert(1)]" aria-hidden="true" />
        <h2 key={lang} aria-label={`${t.cta.l1} ${t.cta.l2}`}>
          <BlurText text={t.cta.l1} delay={90} animateBy="words" className="justify-center font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.035em] text-pure sm:text-5xl lg:text-6xl" />
          <BlurText text={t.cta.l2} delay={90} animateBy="words" className="justify-center font-display text-3xl font-extrabold leading-[1.08] tracking-[-0.035em] text-brand sm:text-5xl lg:text-6xl" />
        </h2>
        <Reveal delay={0.2}>
          <p className="mx-auto mt-6 max-w-md text-lg text-gray-300 [color:#d1d5db]">{t.cta.sub}</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Button href="#login" onClick={e => { e.preventDefault(); onGetStarted(); }}>{t.hero.cta1} <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" /></Button>
            <Button href="/verify" variant="onDark"><FileSearch size={18} /> {t.hero.cta2}</Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
