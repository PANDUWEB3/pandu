import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Boxes, Check, Eye, Factory, Lock, Truck, Wheat } from 'lucide-react';
import { useI18n } from '../i18n';
import { Reveal, SectionHead } from './ui';

const tabIcons = [Wheat, Factory, Boxes, Truck];
const benefitIcons = [Lock, Eye, Check];

export default function Features() {
  const { t } = useI18n();
  const w = t.who;
  const [active, setActive] = useState(0);
  const current = w.tabs[active];

  return (
    <section id="who-its-for" className="scroll-mt-24 bg-mist/70 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <SectionHead eyebrow={w.eyebrow} title={<>{w.title1}<span className="text-brand">{w.title2}</span></>}>{w.sub}</SectionHead>
        </Reveal>

        <Reveal delay={0.1} className="mt-14">
          <div className="grid overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_70px_-40px_rgba(31,41,55,0.4)] ring-1 ring-gray-200 lg:grid-cols-[0.8fr_1.2fr]">
            <div role="tablist" aria-label={w.tabsAria} className="grid grid-cols-2 gap-2 border-b border-gray-100 p-3 lg:flex lg:flex-col lg:border-b-0 lg:border-r lg:p-5">
              {w.tabs.map(({ label }, i) => {
                const Icon = tabIcons[i];
                const on = i === active;
                return (
                  <button key={label} role="tab" aria-selected={on} onClick={() => setActive(i)} className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold transition-all duration-300 lg:text-base ${on ? 'bg-brand text-pure shadow-[0_10px_24px_-10px_rgba(249,115,22,0.8)]' : 'text-ink-soft hover:bg-brand-50 hover:text-brand-600'}`}>
                    <Icon size={20} /> {label}
                  </button>
                );
              })}
            </div>

            <div className="p-6 sm:p-9">
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-lg font-extrabold tracking-tight">{current.label} · {w.exampleLimits}</p>
                <span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-ink-soft">{w.illustrative}</span>
              </div>
              <AnimatePresence mode="wait">
                <motion.ul key={`${active}${t.who.exampleLimits}`} role="tabpanel" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22 }} className="mt-5 divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-200">
                  {current.checks.map(([label, limit]) => (
                    <li key={label} className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5">
                      <span className="font-semibold">{label}</span>
                      <span className="rounded-lg bg-brand-50 px-3 py-1 text-sm font-bold tabular-nums text-brand-700">{limit}</span>
                    </li>
                  ))}
                </motion.ul>
              </AnimatePresence>
              <div className="mt-7 flex flex-wrap items-center gap-2 text-sm font-bold text-ink-soft" aria-label={w.flowAria}>
                {w.flow.map((s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    <span className="rounded-full bg-panel px-3.5 py-1.5 text-pure">{s}</span>
                    {i < w.flow.length - 1 && <span className="h-px w-5 bg-gray-300 sm:w-8" />}
                  </span>
                ))}
                <span className="ml-1 hidden text-gray-500 sm:inline">{w.flowNote}</span>
              </div>
            </div>
          </div>
        </Reveal>

        <ul className="mt-5 grid gap-5 md:grid-cols-3">
          {w.benefits.map(({ title, text }, i) => {
            const Icon = benefitIcons[i];
            return (
              <li key={title}>
                <Reveal delay={i * 0.1} className="h-full">
                  <div className="group h-full rounded-3xl bg-white p-7 ring-1 ring-gray-200 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_50px_-28px_rgba(249,115,22,0.55)] hover:ring-brand/40">
                    <Icon size={24} className="text-brand-600 transition-transform duration-300 group-hover:scale-110" />
                    <h3 className="mt-4 font-display text-lg font-extrabold tracking-tight">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{text}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
