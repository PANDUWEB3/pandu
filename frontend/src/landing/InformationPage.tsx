import { useI18n } from '../i18n';
import Navbar from './Navbar';
import Footer from './Footer';
import HowItWorks from './HowItWorks';
import Features from './Features';

export default function InformationPage({ kind }: { kind: 'how' | 'who' }) {
  const { t } = useI18n();
  return <div className="lp min-h-screen"><Navbar /><main className="pt-20">{kind === 'how' ? <HowItWorks /> : <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32"><h1 className="mb-8 text-center font-display text-4xl font-extrabold text-ink">{t.audience.title}</h1><div className="grid gap-5 sm:grid-cols-2">{t.audience.cards.map((item, i) => <article key={item.title} className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm"><span className="text-sm font-bold text-brand">0{i + 1}</span><h2 className="mt-3 font-display text-xl font-extrabold text-ink">{item.title}</h2><p className="mt-2 leading-relaxed text-ink-soft">{item.text}</p></article>)}</div><div className="mt-12"><Features /></div></section>}</main><Footer /></div>;
}
