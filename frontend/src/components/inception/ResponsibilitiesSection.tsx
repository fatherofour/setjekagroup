'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass } from '@/lib/stage0';
import { memberLabel, type MemberRef } from '@/lib/inception';

interface Item {
  code: string;
  text: string;
  done: boolean;
  source: 'auto' | 'manual' | null;
  evidence: string | null;
  manualCheck: { doneBy: string; doneAt: string; note: string | null } | null;
}

interface RoleBlock {
  key: string;
  label: string;
  members: MemberRef[];
  items: Item[];
}

/** PROCSA Stage 1 responsibilities, role by role. Items the app can see
 * evidence for tick themselves; the rest are signed off by hand with a
 * note (e.g. something done outside the platform). */
export function ResponsibilitiesSection({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [roles, setRoles] = useState<RoleBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('ALL');
  const base = `/projects/${projectId}/inception/responsibilities`;

  useEffect(() => {
    authedFetch<RoleBlock[]>(base)
      .then(setRoles)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load responsibilities.'));
  }, [authedFetch, base]);

  const [signing, setSigning] = useState<string | null>(null);
  const [note, setNote] = useState('');

  async function toggle(role: RoleBlock, item: Item) {
    if (item.source !== 'manual') {
      setSigning(`${role.key}:${item.code}`);
      setNote('');
      return;
    }
    setError(null);
    try {
      setRoles(await authedFetch<RoleBlock[]>(`${base}/${role.key}/${item.code}`, { method: 'DELETE' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update.');
    }
  }

  async function signOff(role: RoleBlock, item: Item) {
    setError(null);
    try {
      setRoles(await authedFetch<RoleBlock[]>(`${base}/${role.key}/${item.code}`, { method: 'PUT', body: { note: note.trim() || undefined } }));
      setSigning(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to sign off.');
    }
  }

  if (error && !roles) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!roles) return <p className="text-sm text-slate-400">Loading…</p>;

  const all = roles.flatMap((r) => r.items);
  const visible = selected === 'ALL' ? roles : roles.filter((r) => r.key === selected);

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <UserCheck size={14} />
          PROCSA Stage 1 responsibilities by role
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Every role&apos;s Inception duties from the PROCSA Responsibility Matrix. Items tick themselves when the work is on file; click an open item to sign it off by hand.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[{ key: 'ALL', label: 'All roles', items: all }, ...roles].map((r) => {
            const done = r.items.filter((i) => i.done).length;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setSelected(r.key)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  selected === r.key
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {r.label} · {done}/{r.items.length}
              </button>
            );
          })}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {visible.map((role) => {
        const done = role.items.filter((i) => i.done).length;
        return (
          <div key={role.key} className={cardClass}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{role.label}</h3>
              <span className="text-xs text-slate-400">
                {done}/{role.items.length} done
              </span>
              <span className="ml-auto truncate text-xs text-slate-500 dark:text-slate-400">
                {role.members.length ? role.members.map(memberLabel).join(', ') : 'Nobody on the team in this role yet'}
              </span>
            </div>
            <ul className="mt-2 space-y-0.5">
              {role.items.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => item.source !== 'auto' && toggle(role, item)}
                    disabled={item.source === 'auto'}
                    title={item.source === 'auto' ? 'Evidenced automatically' : item.source === 'manual' ? 'Click to undo the manual sign-off' : 'Click to sign off by hand'}
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-slate-800/40"
                  >
                    {item.done ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={15} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-600" />}
                    <span className="w-9 shrink-0 font-mono text-[11px] leading-5 text-slate-400">{item.code}</span>
                    <span className="flex-1">
                      <span className={`text-sm ${item.done ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{item.text}</span>
                      {item.evidence && <span className="block text-[11px] text-emerald-700 dark:text-emerald-400">✓ {item.evidence}</span>}
                      {item.manualCheck && (
                        <span className="block text-[11px] text-slate-500">
                          Signed off by {item.manualCheck.doneBy}, {new Date(item.manualCheck.doneAt).toLocaleDateString()}
                          {item.manualCheck.note && ` — ${item.manualCheck.note}`}
                        </span>
                      )}
                    </span>
                  </button>
                  {signing === `${role.key}:${item.code}` && (
                    <div className="mb-1 ml-[60px] flex flex-wrap gap-2">
                      <input
                        autoFocus
                        aria-label="Sign-off note"
                        className="h-8 min-w-[200px] flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        placeholder="How was this done? (optional, e.g. 'agreed at kick-off, see minutes')"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && signOff(role, item)}
                      />
                      <button type="button" onClick={() => signOff(role, item)} className="h-8 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800">
                        Sign off
                      </button>
                      <button type="button" onClick={() => setSigning(null)} className="h-8 rounded-md px-2 text-xs text-slate-500 hover:text-slate-700">
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
