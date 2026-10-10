import { Moon, Sun } from 'lucide-react';
import { useI18n, type Lang } from '../i18n';
import { useTheme } from '../theme';

export function ThemeToggle() {
  const { mode, toggle } = useTheme();
  const { t } = useI18n();
  const dark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t.ctl.toLight : t.ctl.toDark}
      title={dark ? t.ctl.toLight : t.ctl.toDark}
      className="relative grid h-10 w-10 cursor-pointer place-items-center overflow-hidden rounded-full bg-mist text-ink-soft ring-1 ring-inset ring-gray-200 transition-all duration-300 hover:text-brand-600 hover:ring-brand"
    >
      <Sun size={18} className={`absolute transition-all duration-300 ${dark ? 'scale-0 -rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'}`} />
      <Moon size={18} className={`absolute transition-all duration-300 ${dark ? 'scale-100 rotate-0 opacity-100' : 'scale-0 rotate-90 opacity-0'}`} />
    </button>
  );
}

const langs: Array<{ code: Lang; label: string; name: string }> = [
  { code: 'id', label: 'ID', name: 'Bahasa Indonesia' },
  { code: 'en', label: 'EN', name: 'English' },
];

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t.ctl.lang} className="inline-flex rounded-full bg-mist p-1 ring-1 ring-inset ring-gray-200">
      {langs.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          aria-label={l.name}
          title={l.name}
          className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-300 ${lang === l.code ? 'bg-brand text-pure shadow-sm' : 'text-ink-soft hover:text-brand-600'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function Controls() {
  return (
    <div className="flex items-center gap-2">
      <LangSwitch />
      <ThemeToggle />
    </div>
  );
}
