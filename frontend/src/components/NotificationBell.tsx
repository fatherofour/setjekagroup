'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { clientLink } from '@/lib/portal';
import { ALERT_CATEGORY, NOTIFICATIONS_CHANGED, announceNotificationsChanged, timeAgo, type AppNotification } from '@/lib/notifications';

// No realtime infra exists in this app, so this polls rather than pushing -
// every 30 seconds while the tab is visible, and straight away when the
// person comes back to it.
const POLL_INTERVAL_MS = 30_000;
const ALERT_SHOWN_MS = 7_000;

function CategoryIcon({ n }: { n: AppNotification }) {
  const meta = ALERT_CATEGORY[n.category] ?? ALERT_CATEGORY.ACTIONS;
  const Icon = meta.icon;
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`} aria-hidden>
      <Icon size={14} />
    </span>
  );
}

export function NotificationBell() {
  const { authedFetch, user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  // The in-app alert: the newest arrival since the last check.
  const [alert, setAlert] = useState<{ n: AppNotification; more: number } | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    authedFetch<AppNotification[]>('/notifications')
      .then((list) => {
        // The first load only records what's already there - alerts are for
        // things that arrive while you're working.
        if (seen.current) {
          const fresh = list.filter((n) => !n.isRead && !seen.current!.has(n.id) && !n.id.startsWith('synthetic-'));
          if (fresh.length) setAlert({ n: fresh[0], more: fresh.length - 1 });
        }
        seen.current = new Set(list.map((n) => n.id));
        setNotifications(list);
      })
      .catch(() => {});
  }, [authedFetch]);

  useEffect(() => {
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_INTERVAL_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
    };
  }, [load]);

  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), ALERT_SHOWN_MS);
    return () => clearTimeout(t);
  }, [alert]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  // Show the unread count in the browser tab, so it's visible from another tab.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '');
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}` : base;
  }, [unreadCount]);

  function openNotification(n: AppNotification) {
    setOpen(false);
    setAlert(null);
    if (!n.isRead) {
      setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? null);
      authedFetch(`/notifications/${n.id}/read`, { method: 'PATCH' })
        .then(announceNotificationsChanged)
        .catch(() => {});
    }
    router.push(clientLink(n.link ?? (n.projectId ? `/projects/${n.projectId}` : '/my-day'), user));
  }

  async function markAllRead() {
    setNotifications((prev) => prev?.map((x) => ({ ...x, isRead: true })) ?? null);
    await authedFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
    announceNotificationsChanged();
  }

  const recent = notifications?.slice(0, 12) ?? null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 sm:h-8 sm:w-8 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        type="button"
      >
        <Bell size={16} strokeWidth={1.75} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-2 top-14 z-40 flex max-h-[70dvh] flex-col rounded-xl border border-slate-200 bg-white shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:max-h-[28rem] sm:w-96 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex min-h-8 items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
                <Check size={12} />
                Mark all read
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {recent === null ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">Loading…</p>
            ) : recent.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {recent.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => openNotification(n)}
                      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        n.isRead ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      <CategoryIcon n={n} />
                      <span className="min-w-0 flex-1">
                        <span className={`block ${n.isRead ? '' : 'font-medium'}`}>{n.message}</span>
                        <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{[n.project?.name, timeAgo(n.createdAt)].filter(Boolean).join(' · ')}</span>
                      </span>
                      {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-label="Unread" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3 py-2.5 text-center text-sm font-medium text-emerald-700 hover:bg-slate-50 dark:border-slate-800 dark:text-emerald-400 dark:hover:bg-slate-800/50"
          >
            See all notifications
          </Link>
        </div>
      )}

      {/* In-app alert for something that arrived while you were working -
          top of the screen, clear of the chat launcher in the corner below. */}
      <div aria-live="polite" className="pointer-events-none fixed left-1/2 top-16 z-[55] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0">
        {alert && (
          <div className="pointer-events-auto flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <button type="button" onClick={() => openNotification(alert.n)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
              <CategoryIcon n={alert.n} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{alert.n.message}</span>
                <span className="block text-xs text-slate-500">{[alert.n.project?.name, alert.more > 0 ? `and ${alert.more} more` : null].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
            <button type="button" onClick={() => setAlert(null)} aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
