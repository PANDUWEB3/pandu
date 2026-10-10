import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Mode = 'light' | 'dark';
const KEY = 'pandu-theme';

type Ctx = { mode: Mode; toggle: () => void };
const ThemeContext = createContext<Ctx | null>(null);

/** Light is always the default; the user's explicit choice is remembered. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0e1014' : '#fafafa');
  }, [mode]);
  const toggle = useCallback(() => setMode((m) => { const next = m === 'light' ? 'dark' : 'light'; localStorage.setItem(KEY, next); return next; }), []);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
