'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, HelpCircle, Menu } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ThemeToggle } from './ThemeToggle';
import { ProjectSwitcher } from './ProjectSwitcher';
import { StageBadge } from './StageBadge';
import { SearchPalette } from './SearchPalette';
import { getPageTitle } from './pageTitles';

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;
  const initial = user.fullName.trim().charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white"
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
          <button
            onClick={logout}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const pathname = usePathname();
  const { label, icon: Icon } = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
      {/* left: mobile menu + project switcher + stage + page title */}
      <div className="flex min-w-0 shrink items-center gap-2">
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
          aria-label="Open menu"
          type="button"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>
        <ProjectSwitcher />
        <StageBadge />
        <ChevronRight size={14} className="hidden shrink-0 text-slate-300 lg:block dark:text-slate-600" />
        <Icon size={18} className="hidden shrink-0 text-slate-400 dark:text-slate-500 lg:block" />
        <h1 className="hidden truncate text-base font-semibold text-slate-900 lg:block dark:text-slate-100">{label}</h1>
      </div>

      {/* center: functional project search (⌘K) */}
      <div className="flex flex-1 justify-center px-2">
        <SearchPalette />
      </div>

      {/* right: notifications, help, theme, avatar */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 sm:flex"
          aria-label="Notifications"
          type="button"
        >
          <Bell size={16} strokeWidth={1.75} />
        </button>
        <button
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 sm:flex"
          aria-label="Help"
          type="button"
        >
          <HelpCircle size={16} strokeWidth={1.75} />
        </button>
        <div className="mx-1 hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:block" />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
