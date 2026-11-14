'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, ExternalLink, Undo2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { formatDate } from '@/lib/dates';

interface Item {
  code: string;
  text: string;
  done: boolean;
  source: 'auto' | 'manual' | null;
  evidence: string | null;
  tickedBy?: string;
  manualCheck: { doneBy: string; doneAt: string; note: string | null } | null;
  go?: { tab: string; register?: string; label: string };
}
interface Role {
  key: string;
  label: string;
  people: string[];
  done: number;
  total: number;
  items: Item[];
}
interface Stage {
  stage: string;
  number: number;
  label: string;
  purpose: string;
  trackedOn: { kind: 'opportunity'; id: string; name: string } | { kind: 'inception' } | null;
  done: number;
  total: number;
  roles: Role[];
}
interface Tracker {
  projectStage: string;
  done: number;
  total: number;
  stages: Stage[];
}

const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

/** PROCSA, Stage 0 to close-out, for the Development Manager, the Project
 * Manager (the user's direction, 25 Oct 2026) and the Architect (26 Oct).
 * Outside parties see only their own role's list. Each item ticks from
 * what's on the platform, or is signed off by hand with a note; each says
 * where the work is done. */
export function ProcsaTracker({ projectId, onGoTo }: { projectId: string; onGoTo: (tab: string, register?: string) => void }) {
  const { authedFetch, user } = useAuth();
  const internal = user?.accountType === 'INTERNAL' || user?.role === 'ADMIN';
  const [data, setData] = useState<Tracker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);

  const load = useCallback(() => {
    authedFetch<Tracker>(`/projects/${projectId}/procsa`)
      .then((d) => {
        setData(d);
        setSelected((s) => s ?? d.projectStage);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the PROCSA tracker'));
  }, [authedFetch, projectId]);

  useEffect(load, [load]);

  async function check(stage: string, role: string, code: string, done: boolean) {
    setError(null);
    try {
      setData(await authedFetch<Tracker>(`/projects/${projectId}/procsa/${stage}/${role}/${code}`, { method: 'PUT', body: { done, note: done ? note.trim() || undefined : undefined } }));
      setNoteFor(null);
      setNote('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    }
  }

  if (error && !data) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;
  const stage = data.stages.find((s) => s.stage === selected) ?? data.stages[0];
  const roleLabels = [...new Set(data.stages.flatMap((s) => s.roles.map((r) => r.label)))];
  const heading = roleLabels.length ? roleLabels.join(roleLabels.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1') : 'No responsibilities for your role';
  const columns = Math.max(...data.stages.map((s) => s.roles.length));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">PROCSA responsibilities · {heading}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Every item from the PROCSA Responsibility Matrix, Stage 0 to close-out. Items tick themselves from what&apos;s on the platform; anything done elsewhere can be signed off with a note.
            </p>
          </div>
          <p className="text-right">
            <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{data.done}</span>
            <span className="text-slate-400">/{data.total}</span>
            <span className="block text-xs text-slate-500">done overall</span>
          </p>
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Stages">
          {data.stages.map((s) => {
            const current = s.stage === data.projectStage;
            const active = s.stage === stage.stage;
            return (
              <li key={s.stage}>
                <button
                  type="button"
                  onClick={() => setSelected(s.stage)}
                  aria-pressed={active}
                  className={`w-full rounded-lg border p-2 text-left transition ${
                    active ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Stage {s.number}
                    {current && <span className="ml-1 text-emerald-700 dark:text-emerald-400">· now</span>}
                  </span>
                  <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-100">{s.label}</span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${pct(s.done, s.total)}%` }} />
                  </span>
                  <span className="mt-0.5 block text-[11px] tabular-nums text-slate-500">
                    {s.done}/{s.total}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Stage {stage.number} · {stage.label}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{stage.purpose}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            Only what&apos;s still open
          </label>
        </div>

        {stage.trackedOn?.kind === 'opportunity' && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Stage 0 was run on the opportunity{' '}
            <Link href={`/opportunities/${stage.trackedOn.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              {stage.trackedOn.name}
            </Link>
            , by the Development Manager and the Project Manager together. Sign items off there.
          </p>
        )}
        {stage.stage === 'INITIATION' && !stage.trackedOn && <p className="mt-3 text-sm text-slate-400">This project didn&apos;t come from an opportunity, so there&apos;s no Stage 0 record.</p>}
        {stage.trackedOn?.kind === 'inception' && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Stage 1 items are worked and signed off on the{' '}
            <button type="button" onClick={() => onGoTo('inception')} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Inception (Stage 1)
            </button>{' '}
            tab.
          </p>
        )}

        {stage.roles.length === 0 && stage.stage !== 'INITIATION' && (
          <p className="mt-3 text-sm text-slate-500">PROCSA gives your role no responsibilities to track here.</p>
        )}
        <div className={`mt-4 grid gap-4 ${columns >= 3 ? 'lg:grid-cols-2 2xl:grid-cols-3' : columns === 2 ? 'lg:grid-cols-2' : ''}`}>
          {stage.roles.map((role) => (
            <section key={role.key} aria-label={role.label}>
              <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1.5 dark:border-slate-800">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{role.label}</h4>
                <span className="text-xs tabular-nums text-slate-500">
                  {role.done}/{role.total}
                  {role.people.length > 0 && ` · ${role.people.join(', ')}`}
                </span>
              </div>
              {role.people.length === 0 && <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">Nobody holds this role on the project&apos;s team yet.</p>}
              <ul className="space-y-1.5">
                {role.items
                  .filter((i) => !onlyOpen || !i.done)
                  .map((i) => {
                    const id = `${stage.stage}:${role.key}:${i.code}`;
                    // The architect signs off their own items (the server checks it's theirs).
                    const editable = (internal || role.key === 'ARCHITECT') && stage.number >= 2;
                    return (
                      <li key={i.code} className="rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
                        <div className="flex items-start gap-2">
                          {i.done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Done" /> : <Circle size={16} className="mt-0.5 shrink-0 text-slate-300" aria-label="Open" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-800 dark:text-slate-100">
                              <span className="mr-1 font-mono text-xs text-slate-400">{i.code}</span>
                              {i.text}
                            </p>
                            {i.evidence ? (
                              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">{i.evidence}</p>
                            ) : i.manualCheck ? (
                              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                                Signed off by {i.manualCheck.doneBy} on {formatDate(i.manualCheck.doneAt)}
                                {i.manualCheck.note && ` — ${i.manualCheck.note}`}
                              </p>
                            ) : (
                              i.tickedBy && <p className="mt-0.5 text-xs text-slate-500">Ticks when: {i.tickedBy}</p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                              {i.go && (
                                <button type="button" onClick={() => onGoTo(i.go!.tab, i.go!.register)} className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                                  {i.go.label} <ArrowRight size={11} />
                                </button>
                              )}
                              {editable && !i.done && noteFor !== id && (
                                <button type="button" onClick={() => setNoteFor(id)} className="text-slate-500 hover:underline">
                                  Sign off by hand
                                </button>
                              )}
                              {editable && i.source === 'manual' && (
                                <button type="button" onClick={() => check(stage.stage, role.key, i.code, false)} className="inline-flex items-center gap-1 text-slate-500 hover:underline">
                                  <Undo2 size={11} /> Undo
                                </button>
                              )}
                            </div>
                            {noteFor === id && (
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <input
                                  autoFocus
                                  className="h-8 min-w-[200px] flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                  placeholder="How it was done (optional), e.g. agreed by email on 12 Nov"
                                  value={note}
                                  onChange={(e) => setNote(e.target.value)}
                                  aria-label={`Note for ${i.code}`}
                                />
                                <button type="button" onClick={() => check(stage.stage, role.key, i.code, true)} className="h-8 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white hover:bg-emerald-800">
                                  Sign off
                                </button>
                                <button type="button" onClick={() => setNoteFor(null)} className="h-8 rounded-md px-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
              </ul>
              {stage.trackedOn?.kind === 'opportunity' && (
                <Link href={`/opportunities/${stage.trackedOn.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                  Open the Stage 0 tracker <ExternalLink size={11} />
                </Link>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
