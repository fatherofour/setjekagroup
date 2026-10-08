'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellOff, Check, Lock, Mail, MailOpen, Settings2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { clientLink } from '@/lib/portal';
import { Select } from '@/components/ui/Select';
import {
  ALERT_CATEGORIES,
  ALERT_CATEGORY,
  NOTIFICATIONS_CHANGED,
  announceNotificationsChanged,
  timeAgo,
  type AlertCategory,
  type AppNotification,
} from '@/lib/notifications';

const input =
  'h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:h-9 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

interface Preference {
  category: AlertCategory;
  muted: boolean;
  locked: boolean;
}

function dayGroup(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d > today) return 'Coming up';
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (today.getTime() - d.getTime() < 7 * 86_400_000) return 'This week';
  return 'Earlier';
}

/** Every in-app alert in one place: filter by kind, project or unread,
 * mark read or unread, and choose which kinds of alert you get. */
export default function NotificationsPage() {
  const { authedFetch, user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [category, setCategory] = useState<AlertCategory | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [prefs, setPrefs] = useState<Preference[] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (unreadOnly) params.set('unread', '1');
    authedFetch<AppNotification[]>(`/notifications?${params}`)
      .then(setItems)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load notifications'));
  }, [authedFetch, category, unreadOnly]);

  useEffect(load, [load]);
  useEffect(() => {
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, load);
  }, [load]);
  useEffect(() => {
    authedFetch<Preference[]>('/notifications/preferences')
      .then(setPrefs)
      .catch(() => {});
  }, [authedFetch]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of items ?? []) if (n.project) map.set(n.project.id, n.project.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const shown = useMemo(() => (items ?? []).filter((n) => !projectId || n.projectId === projectId), [items, projectId]);
  const groups = useMemo(() => {
    const out: { label: string; items: AppNotification[] }[] = [];
    for (const n of shown) {
      const label = dayGroup(n.createdAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(n);
      else out.push({ label, items: [n] });
    }
    return out;
  }, [shown]);
  const unread = shown.filter((n) => !n.isRead).length;

  async function setRead(n: AppNotification, isRead: boolean) {
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, isRead } : x)) ?? null);
    await authedFetch(`/notifications/${n.id}/${isRead ? 'read' : 'unread'}`, { method: 'PATCH' }).catch(() => {});
    announceNotificationsChanged();
  }

  function open(n: AppNotification) {
    if (!n.isRead) void setRead(n, true);
    router.push(clientLink(n.link ?? (n.projectId ? `/projects/${n.projectId}` : '/my-day'), user));
  }

  async function markAllRead() {
    await authedFetch('/notifications/read-all', { method: 'PATCH' }).catch(() => {});
    announceNotificationsChanged();
  }

  async function toggleMute(p: Preference) {
    if (!prefs || p.locked) return;
    const muted = prefs.filter((x) => (x.category === p.category ? !p.muted : x.muted)).map((x) => x.category);
    try {
      setPrefs(await authedFetch<Preference[]>('/notifications/preferences', { method: 'PUT', body: { muted } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save your alert settings');
    }
  }

  const chip = (active: boolean) =>
    `inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition sm:min-h-8 ${
      active
        ? 'border-emerald-700 bg-emerald-700 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
    }`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Notifications</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{unread ? `${unread} unread` : 'You’re all caught up.'}</p>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 sm:h-9 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Check size={14} /> Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 sm:h-9 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings2 size={14} /> Alert settings
          </button>
        </div>
      </div>

      {showSettings && prefs && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-labelledby="alert-settings">
          <h2 id="alert-settings" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Which alerts you get
          </h2>
          <p className="mb-3 text-xs text-slate-500">These are in-app alerts. Switching a kind off stops new ones; nothing already here is removed.</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {prefs.map((p) => {
              const meta = ALERT_CATEGORY[p.category];
              const Icon = meta.icon;
              return (
                <li key={p.category} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`} aria-hidden>
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{meta.label}</span>
                    <span className="block text-xs text-slate-500">{meta.description}</span>
                  </span>
                  {p.locked ? (
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Lock size={12} /> Always on
                    </span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!p.muted}
                      aria-label={`${meta.label} alerts`}
                      onClick={() => toggleMute(p)}
                      className={`relative h-7 w-12 shrink-0 rounded-full transition ${p.muted ? 'bg-slate-300 dark:bg-slate-700' : 'bg-emerald-600'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${p.muted ? 'left-1' : 'left-6'}`} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(category === '')} onClick={() => setCategory('')} aria-pressed={category === ''}>
          All
        </button>
        {ALERT_CATEGORIES.map((c) => {
          const Icon = ALERT_CATEGORY[c].icon;
          const muted = prefs?.find((p) => p.category === c)?.muted;
          return (
            <button key={c} type="button" className={chip(category === c)} onClick={() => setCategory(c)} aria-pressed={category === c}>
              <Icon size={14} />
              {ALERT_CATEGORY[c].label}
              {muted && <BellOff size={12} aria-label="switched off" />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        {projects.length > 1 && (
          <div className="w-full sm:w-64">
            <Select className={input} aria-label="Project" value={projectId} onChange={setProjectId} options={[{ value: '', label: 'All projects' }, ...projects.map(([id, name]) => ({ value: id, label: name }))]} />
          </div>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {items === null ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700">
          {unreadOnly || category || projectId ? 'Nothing matches these filters.' : 'No notifications yet.'}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
              {g.items.map((n) => {
                const meta = ALERT_CATEGORY[n.category] ?? ALERT_CATEGORY.ACTIONS;
                const Icon = meta.icon;
                return (
                  <li key={n.id} className={`flex items-start gap-1 ${n.isRead ? '' : 'bg-emerald-50/50 dark:bg-emerald-950/20'}`}>
                    <button type="button" onClick={() => open(n)} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`} aria-hidden>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.isRead ? 'text-slate-600 dark:text-slate-400' : 'font-medium text-slate-900 dark:text-slate-100'}`}>{n.message}</span>
                        <span className="block text-xs text-slate-500">{[meta.label, n.project?.name, timeAgo(n.createdAt)].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRead(n, !n.isRead)}
                      disabled={n.isRead && n.id.startsWith('synthetic-')}
                      aria-label={n.isRead ? 'Mark as unread' : 'Mark as read'}
                      title={n.isRead ? 'Mark as unread' : 'Mark as read'}
                      className="m-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-800"
                    >
                      {n.isRead ? <Mail size={16} /> : <MailOpen size={16} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
