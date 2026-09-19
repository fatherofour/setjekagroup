'use client';

import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';

export function ThemeToggle() {
  const { theme, cycle } = useTheme();
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const label = theme === 'light' ? 'Light mode (click to switch to dark)' : theme === 'dark' ? 'Dark mode (click to switch to system)' : 'System theme (click to switch to light)';

  return (
    <button
      onClick={cycle}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}
