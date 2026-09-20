'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface Notification {
  id: string;
  projectId: string;
  type: 'TASK_ASSIGNED' | 'ISSUE_ASSIGNED' | 'MENTIONED' | 'DUE_SOON';
  message: string;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// No realtime infra exists in this app, so this polls on an interval rather
// than pushing — consistent with every other module here (fetch-on-load,
// no websockets).
const POLL_INTERVAL_MS = 60_000;

export function NotificationBell() {
  const { authedFetch } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => {
    authedFetch<Notification[]>('/notifications')
      .then(setNotifications)
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unreadCount = notifications?.filter((n) => !n.isRead).length ?? 0;

  async function openNotification(n: Notification) {
    setOpen(false);
    if (!n.isRead) {
      setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) ?? null);
      authedFetch(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {});
    }
    router.push(`/projects/${n.projectId}`);
  }

  async function markAllRead() {
    setNotifications((prev) => prev?.map((x) => ({ ...x, isRead: true })) ?? null);
    await authedFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 sm:flex"
        aria-label="Notifications"
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
        <div className="absolute right-0 top-10 z-40 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">
                <Check size={12} />
                Mark all read
              </button>
            )}
          </div>
          {notifications === null ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openNotification(n)}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                      n.isRead ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {!n.isRead && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />}
                    <span className={n.isRead ? 'ml-3.5' : ''}>
                      <span className="block">{n.message}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
