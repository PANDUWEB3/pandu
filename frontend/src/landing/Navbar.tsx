import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { Button, Logo } from './ui';
import { Controls } from './Controls';

export default function Navbar() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const links = [
    { label: t.nav.how, href: '/#how-it-works' },
    { label: t.nav.who, href: '/#who-its-for' },
    { label: t.nav.verify, href: '/verify' },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div className={`mx-auto max-w-6xl rounded-3xl transition-all duration-300 ${scrolled || open ? 'bg-white/85 shadow-[0_8px_30px_-12px_rgba(31,41,55,0.25)] ring-1 ring-gray-200/80 backdrop-blur-xl' : 'bg-transparent'}`}>
        <nav className="flex h-14 items-center justify-between pl-4 pr-2.5 sm:pl-5" aria-label="Main">
          <Logo />
          <ul className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="rounded-full px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-brand-50 hover:text-brand-600">{l.label}</a>
              </li>
            ))}
          </ul>
          <div className="hidden items-center gap-3 lg:flex">
            <Controls />
            <span className="h-6 w-px bg-gray-200" aria-hidden="true" />
            <Button href="/login" size="sm">{t.nav.start}</Button>
          </div>
          <button className="grid h-10 w-10 cursor-pointer place-items-center rounded-full text-ink transition-colors hover:bg-mist lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t.nav.menuClose : t.nav.menuOpen}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </nav>
        <div id="mobile-menu" className={`grid transition-[grid-template-rows] duration-300 lg:hidden ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
            <ul className="flex flex-col gap-1 px-3 pb-4">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} className="block rounded-2xl px-4 py-3 font-semibold text-ink hover:bg-brand-50 hover:text-brand-600">{l.label}</a>
                </li>
              ))}
              <li className="mt-1 flex items-center justify-between gap-2 px-1 py-2">
                <Controls />
                <Button href="/login" size="sm">{t.nav.start}</Button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </header>
  );
}
