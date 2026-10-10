import { ArrowRight, BadgeCheck, FileSearch, Link2, QrCode, ShieldCheck } from 'lucide-react';
import SplitText from './reactbits/SplitText';
import ShinyText from './reactbits/ShinyText';
import CountUp from './reactbits/CountUp';
import { useI18n } from '../i18n';
import { useTheme } from '../theme';
import { Button, Reveal, Tilt } from './ui';

/** Illustrative sample certificate. Values are fixtures, not real data. */
function SampleCertificate() {
  const { t } = useI18n();
  const c = t.hero.cert;
  const rows: Array<[string, string]> = [
    [c.product, c.productV],
    [c.batch, 'BT-2041'],
    [c.inspectedBy, c.inspectedByV],
    [c.approvedBy, c.approvedByV],
  ];
  return (
    <Tilt>
      <div className="animate-float rounded-[1.75rem] bg-white p-5 shadow-[0_40px_80px_-30px_rgba(31,41,55,0.35)] ring-1 ring-gray-200/80 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">{c.kicker}</p>
            <h3 className="mt-1 font-display text-xl font-extrabold tracking-tight">{c.title}</h3>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <BadgeCheck size={14} /> {c.verified}
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between rounded-2xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-100">
          <div>
            <p className="text-xs font-semibold text-brand-700">{c.moisture}</p>
            <p className="mt-1 font-display text-4xl font-extrabold tabular-nums tracking-tight text-ink">
              <CountUp to={11.8} duration={1.6} delay={0.6} />
              <span className="ml-0.5 text-xl text-ink-soft">%</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-soft">{c.range}</p>
            <p className="font-semibold tabular-nums">10 – 12.5%</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><ShieldCheck size={13} /> {c.within}</p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-gray-100 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-gray-500">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-mist p-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white text-ink ring-1 ring-gray-200"><QrCode size={42} strokeWidth={1.4} /></div>
          <div className="min-w-0 text-xs">
            <p className="inline-flex items-center gap-1.5 font-bold text-brand-700"><Link2 size={14} /> {c.chain}</p>
            <p className="mt-1 truncate font-mono text-gray-500">0x7a3f…c91e2b</p>
            <p className="text-gray-500">{c.scan}</p>
          </div>
        </div>
      </div>
    </Tilt>
  );
}

export default function Hero({ onGetStarted = () => { window.location.href = '/login'; } }: { onGetStarted?: () => void } = {}) {
  const { t, lang } = useI18n();
  const { mode } = useTheme();
  return (
    <section className="relative isolate overflow-hidden pb-20 pt-32 sm:pt-40 lg:pb-28">
      <div className="lp-grid absolute inset-0 -z-10" aria-hidden="true" />
      <div className="absolute -right-32 top-10 -z-10 h-[30rem] w-[30rem] rounded-full bg-brand/20 blur-[110px]" aria-hidden="true" />
      <div className="absolute -left-40 top-64 -z-10 h-80 w-80 rounded-full bg-amber-200/40 blur-[110px]" aria-hidden="true" />

      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-bold shadow-sm ring-1 ring-gray-200">
              <span className="h-2 w-2 rounded-full bg-brand" />
              <ShinyText key={`${lang}${mode}`} text={t.hero.badge} speed={3.5} color={mode === 'dark' ? '#aab2bf' : '#4b5563'} shineColor="#f97316" />
            </span>
          </Reveal>

          <h1 key={lang} className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-ink sm:text-6xl lg:text-[4.4rem]" aria-label={`${t.hero.h1a} ${t.hero.h1b}`}>
            <SplitText text={t.hero.h1a} tag="span" className="block" textAlign="left" splitType="words" delay={70} duration={0.9} rootMargin="0px" />
            <SplitText text={t.hero.h1b} tag="span" className="block text-brand" textAlign="left" splitType="chars" delay={60} duration={0.9} rootMargin="0px" />
          </h1>

          <Reveal delay={0.25}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">{t.hero.sub}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button href="#login" onClick={e => { e.preventDefault(); onGetStarted(); }}>{t.hero.cta1} <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" /></Button>
              <Button href="/verify" variant="secondary"><FileSearch size={18} /> {t.hero.cta2}</Button>
            </div>
            <p className="mt-5 text-sm text-gray-500">{t.hero.privacy}</p>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="relative mx-auto w-full max-w-md lg:max-w-none">
          <SampleCertificate />
        </Reveal>
      </div>
    </section>
  );
}
