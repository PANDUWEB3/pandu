import { ClipboardCheck, ShieldCheck, Share2, FileCheck2, SearchCheck } from 'lucide-react';
import SpotlightCard from './reactbits/SpotlightCard';
import { useI18n } from '../i18n';
import { useTheme } from '../theme';
import { Reveal, SectionHead } from './ui';

const icons = [ClipboardCheck, ShieldCheck, FileCheck2, Share2, SearchCheck];

export default function HowItWorks() {
  const { t } = useI18n();
  const { mode } = useTheme();
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 sm:py-32">
      <Reveal>
        <SectionHead eyebrow={t.how.eyebrow} title={t.how.title}>{t.how.sub}</SectionHead>
      </Reveal>

      <ol className="relative mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {t.how.steps.map(({ title, text, tag }, i) => {
          const Icon = icons[i];
          return (
            <li key={i}>
              <SpotlightCard key={mode} theme={mode} spotlightColor="#f97316" className="group h-full transition-transform duration-300 hover:-translate-y-2">
                  <div className="relative flex h-full flex-col p-7 sm:p-8">
                    <div className="flex items-center justify-between">
                      <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 transition-colors duration-300 group-hover:bg-brand group-hover:text-pure">
                        <Icon size={26} />
                      </span>
                      <span className="font-display text-5xl font-extrabold tabular-nums text-gray-200 transition-colors duration-300 group-hover:text-brand/40">0{i + 1}</span>
                    </div>
                    <h3 className="mt-6 font-display text-xl font-extrabold tracking-tight text-ink">{title}</h3>
                    <p className="mt-2 flex-1 leading-relaxed text-ink-soft">{text}</p>
                    <span className="mt-6 inline-block w-fit rounded-full bg-mist px-3 py-1 text-xs font-bold text-ink-soft">{tag}</span>
                  </div>
              </SpotlightCard>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
