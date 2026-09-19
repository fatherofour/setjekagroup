'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { GREEN } from '@/lib/auth-theme';
import { NAV, isNavGroup } from './nav';

const OPEN_GROUPS_KEY = 'setjeka_sidebar_open_groups';
const COLLAPSED_KEY = 'setjeka_sidebar_collapsed';

function defaultOpenState(): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const entry of NAV) {
    if (isNavGroup(entry)) state[entry.label] = true;
  }
  return state;
}

export function Sidebar({ open }: { open: boolean }) {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpenState);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_GROUPS_KEY);
      if (stored) setOpenGroups({ ...defaultOpenState(), ...JSON.parse(stored) });
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // localStorage unavailable or corrupt value - keep defaults
    }
  }, []);

  useEffect(() => {
    for (const entry of NAV) {
      if (isNavGroup(entry) && entry.children.some((c) => c.href === pathname)) {
        setOpenGroups((prev) => (prev[entry.label] ? prev : { ...prev, [entry.label]: true }));
      }
    }
  }, [pathname]);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col text-emerald-50 transition-all duration-200 lg:static lg:z-auto lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      } ${collapsed ? 'lg:w-[68px]' : 'lg:w-60'}`}
      style={{ backgroundColor: GREEN }}
    >
      <div className={`flex items-center px-5 py-6 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={collapsed ? '/setjeka/icon-mark.png' : '/setjeka/logo.png'}
          alt="Setjeka Group"
          className={collapsed ? 'hidden h-8 w-8 lg:block' : 'h-auto w-[116px]'}
          style={{ filter: 'brightness(0) invert(1)' }}
          draggable={false}
        />
        {/* Mobile always shows the full wordmark, even while "collapsed" applies only at lg+. */}
        {collapsed && (
          <img
            src="/setjeka/logo.png"
            alt="Setjeka Group"
            className="h-auto w-[116px] lg:hidden"
            style={{ filter: 'brightness(0) invert(1)' }}
            draggable={false}
          />
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((entry) => {
          if (isNavGroup(entry)) {
            const GroupIcon = entry.icon;
            const isOpen = openGroups[entry.label] ?? true;
            return (
              <div key={entry.label}>
                <button
                  onClick={() => (collapsed ? toggleCollapsed() : toggleGroup(entry.label))}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-black/10 ${
                    collapsed ? 'lg:justify-center lg:px-0' : ''
                  }`}
                  aria-expanded={isOpen}
                  title={collapsed ? entry.label : undefined}
                >
                  <GroupIcon size={16} strokeWidth={1.75} />
                  <span className={collapsed ? 'flex-1 text-left lg:hidden' : 'flex-1 text-left'}>{entry.label}</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${collapsed ? 'lg:hidden' : ''}`}
                    style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  />
                </button>
                {isOpen && (
                  <div className={`mt-0.5 space-y-0.5 pl-4 ${collapsed ? 'lg:hidden' : ''}`}>
                    {entry.children.map((child) => {
                      const active = pathname === child.href;
                      const ChildIcon = child.icon;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                            active ? 'bg-emerald-800 text-white' : 'text-emerald-100 hover:bg-black/10'
                          }`}
                        >
                          <ChildIcon size={14} strokeWidth={1.75} />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = pathname === entry.href;
          const Icon = entry.icon;
          return (
            <Link
              key={entry.href}
              href={entry.href}
              title={collapsed ? entry.label : undefined}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                active ? 'bg-emerald-800 text-white' : 'text-emerald-100 hover:bg-black/10'
              } ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span className={collapsed ? 'lg:hidden' : ''}>{entry.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={`px-3 pb-4 ${collapsed ? 'lg:flex lg:justify-center' : ''}`}>
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-emerald-100 transition hover:bg-black/10 lg:flex"
        >
          {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
