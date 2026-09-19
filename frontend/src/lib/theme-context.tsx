'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  resolved: Resolved;
  cycle: () => void;
}

const THEME_KEY = 'setjeka_theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(theme: Theme): Resolved {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
}

function apply(resolved: Resolved) {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [resolved, setResolved] = useState<Resolved>('light');

  useEffect(() => {
    let initial: Theme = 'system';
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') initial = stored;
    } catch {
      // localStorage unavailable - fall back to system default
    }
    setTheme(initial);
    const r = resolve(initial);
    setResolved(r);
    apply(r);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setTheme((current) => {
        if (current === 'system') {
          const r2 = resolve('system');
          setResolved(r2);
          apply(r2);
        }
        return current;
      });
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const cycle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // ignore
      }
      const r = resolve(next);
      setResolved(r);
      apply(r);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ theme, resolved, cycle }), [theme, resolved, cycle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
