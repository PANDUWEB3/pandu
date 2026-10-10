import { useI18n } from '../i18n';
import { Logo } from './ui';

export default function Footer() {
  const { t } = useI18n();
  const links = [
    { label: t.nav.how, href: t.nav.home === 'PANDU home' ? '/how-it-works' : '/cara-kerja' },
    { label: t.nav.who, href: t.nav.home === 'PANDU home' ? '/who-its-for' : '/untuk-siapa' },
    { label: t.nav.verify, href: '/verify' },
    { label: t.nav.login, href: '/login' },
  ];
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 py-10 md:flex-row md:justify-between">
        <Logo />
        <ul className="flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm font-medium text-ink-soft">
          {links.map((l) => (
            <li key={l.label}><a href={l.href} className="transition-colors hover:text-brand-600">{l.label}</a></li>
          ))}
        </ul>
        <p className="text-sm text-gray-500">© {new Date().getFullYear()} PANDU. {t.footer.rights}</p>
      </div>
    </footer>
  );
}
