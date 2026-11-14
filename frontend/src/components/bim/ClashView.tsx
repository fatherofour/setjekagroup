'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Box, Loader2, Pencil, Play, Plus, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { cardCls, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls } from '@/lib/architect';
import { CLASH_STATUS, describeSelection, ifcLabel, type ClashStatus, type Selection } from '@/lib/bim';
import { SelectionEditor } from './SelectionEditor';
import type { HubContext } from './BimHubPanel';

interface Test {
  id: string;
  name: string;
  selectionA: Selection;
  selectionB: Selection;
  tolerance: number;
  lastRunAt: string | null;
  lastRunMs: number | null;
  createdBy: { fullName: string };
  counts: Partial<Record<ClashStatus, number>>;
}
interface Clash {
  id: string;
  aDocumentId: string;
  aGlobalId: string;
  aName: string | null;
  aType: string;
  aModel: string | null;
  bDocumentId: string;
  bGlobalId: string;
  bName: string | null;
  bType: string;
  bModel: string | null;
  overlap: number;
  status: ClashStatus;
  issueId: string | null;
  note: string | null;
  noteCount: number;
  firstSeenAt: string;
}
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const emptyTest = () => ({ name: '', selectionA: {} as Selection, selectionB: {} as Selection, toleranceMm: '10' });

/** Clash detection: two selections of elements, tested against each other
 * from their bounding boxes. Re-running keeps each clash's status; what is
 * no longer found is resolved by itself. */
export function ClashView({ ctx }: { ctx: HubContext }) {
  const { authedFetch } = useAuth();
  const { projectId, vocab, modelName, openViewer } = ctx;
  const [tests, setTests] = useState<Test[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState<(ReturnType<typeof emptyTest> & { id?: string }) | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTests = useCallback(() => {
    authedFetch<Test[]>(`/projects/${projectId}/bim/clash-tests`)
      .then((t) => {
        setTests(t);
        setCurrent((c) => c ?? t[0]?.id ?? null);
      })
      .catch((e) => setError(err(e, 'Could not load the clash tests')));
  }, [authedFetch, projectId]);
  useEffect(loadTests, [loadTests]);

  const loadClashes = useCallback(() => {
    if (!current) return;
    authedFetch<Clash[]>(`/projects/${projectId}/bim/clash-tests/${current}/clashes${status ? `?status=${status}` : ''}`)
      .then(setClashes)
      .catch((e) => setError(err(e, 'Could not load the clashes')));
  }, [authedFetch, projectId, current, status]);
  useEffect(loadClashes, [loadClashes]);

  async function save() {
    if (!form) return;
    setError(null);
    try {
      const body = { name: form.name.trim(), selectionA: form.selectionA, selectionB: form.selectionB, tolerance: Math.max(0, Number(form.toleranceMm) || 0) / 1000 };
      const t = await authedFetch<Test[]>(form.id ? `/projects/${projectId}/bim/clash-tests/${form.id}` : `/projects/${projectId}/bim/clash-tests`, { method: form.id ? 'PATCH' : 'POST', body });
      setTests(t);
      setCurrent(form.id ?? t[t.length - 1]?.id ?? null);
      setForm(null);
    } catch (e) {
      setError(err(e, 'Could not save the test'));
    }
  }

  async function run(t: Test) {
    setRunning(t.id);
    setRunMsg(null);
    setError(null);
    try {
      const r = await authedFetch<{ found: number; new: number; resolved: number; elementsA: number; elementsB: number; ms: number }>(`/projects/${projectId}/bim/clash-tests/${t.id}/run`, { method: 'POST' });
      setRunMsg(`${r.found} clash${r.found === 1 ? '' : 'es'} found (${r.new} new, ${r.resolved} now resolved) between ${r.elementsA.toLocaleString('en-GB')} and ${r.elementsB.toLocaleString('en-GB')} elements in ${(r.ms / 1000).toFixed(1)} s.`);
      setCurrent(t.id);
      loadTests();
      loadClashes();
    } catch (e) {
      setError(err(e, 'The test could not run'));
    } finally {
      setRunning(null);
    }
  }

  async function remove(t: Test) {
    if (!confirm(`Delete the clash test "${t.name}" and its clashes?`)) return;
    try {
      setTests(await authedFetch<Test[]>(`/projects/${projectId}/bim/clash-tests/${t.id}`, { method: 'DELETE' }));
      if (current === t.id) setCurrent(null);
    } catch (e) {
      setError(err(e, 'Could not delete it'));
    }
  }

  async function setClashStatus(c: Clash, s: ClashStatus) {
    try {
      await authedFetch(`/projects/${projectId}/bim/clashes/${c.id}`, { method: 'PATCH', body: { status: s } });
      loadClashes();
      loadTests();
    } catch (e) {
      setError(err(e, 'Could not change it'));
    }
  }

  async function raise(c: Clash) {
    try {
      await authedFetch(`/projects/${projectId}/bim/clashes/${c.id}/issue`, { method: 'POST', body: {} });
      loadClashes();
    } catch (e) {
      setError(err(e, 'Could not raise the issue'));
    }
  }

  const show = (c: Clash) =>
    openViewer([...new Set([c.aDocumentId, c.bDocumentId])], {
      focus: {
        label: `Clash: overlap ${(c.overlap * 1000).toFixed(0)} mm`,
        items: [
          { documentId: c.aDocumentId, globalId: c.aGlobalId, colour: '#dc2626', label: `${ifcLabel(c.aType)} · ${c.aName ?? c.aGlobalId}` },
          { documentId: c.bDocumentId, globalId: c.bGlobalId, colour: '#2563eb', label: `${ifcLabel(c.bType)} · ${c.bName ?? c.bGlobalId}` },
        ],
      },
    });
  const test = tests?.find((t) => t.id === current) ?? null;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Clash tests</h2>
            <p className="mt-0.5 text-xs text-slate-500">Choose what to test against what - walls against ducts, the structural model against the services. Overlaps smaller than the tolerance are ignored.</p>
          </div>
          {!form && (
            <button type="button" className={primaryBtn} onClick={() => setForm(emptyTest())}>
              <Plus size={14} /> New clash test
            </button>
          )}
        </div>
        {form && (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
              <label className={labelCls}>
                Name
                <input className={`${inputCls} mt-0.5`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Structure v services" maxLength={120} />
              </label>
              <label className={labelCls}>
                Tolerance (mm)
                <input className={`${inputCls} mt-0.5`} inputMode="numeric" value={form.toleranceMm} onChange={(e) => setForm({ ...form, toleranceMm: e.target.value })} />
              </label>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <fieldset className="rounded-md border border-red-200 p-3 dark:border-red-900">
                <legend className="px-1 text-xs font-semibold text-red-700 dark:text-red-400">Selection A</legend>
                <SelectionEditor projectId={projectId} value={form.selectionA} onChange={(selectionA) => setForm({ ...form, selectionA })} vocab={vocab} compact />
              </fieldset>
              <fieldset className="rounded-md border border-blue-200 p-3 dark:border-blue-900">
                <legend className="px-1 text-xs font-semibold text-blue-700 dark:text-blue-400">Selection B</legend>
                <SelectionEditor projectId={projectId} value={form.selectionB} onChange={(selectionB) => setForm({ ...form, selectionB })} vocab={vocab} compact />
              </fieldset>
            </div>
            <div className="flex gap-2">
              <button type="button" className={primaryBtn} disabled={!form.name.trim()} onClick={save}>
                Save test
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {runMsg && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{runMsg}</p>}
        <ul className="mt-3 space-y-2">
          {tests?.length === 0 && !form && <li className="text-sm text-slate-500">No clash tests yet.</li>}
          {tests?.map((t) => (
            <li key={t.id} className={`rounded-lg border p-3 ${t.id === current ? 'border-emerald-500' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCurrent(t.id)}>
                  <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">{t.name}</span>
                  <span className="block text-xs text-slate-500">
                    <span className="text-red-700 dark:text-red-400">A:</span> {describeSelection(t.selectionA, modelName)} · <span className="text-blue-700 dark:text-blue-400">B:</span> {describeSelection(t.selectionB, modelName)}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {(Object.keys(CLASH_STATUS) as ClashStatus[]).map((s) => (t.counts[s] ? <span key={s} className={`rounded-full px-1.5 py-0.5 font-medium ${CLASH_STATUS[s].tone}`}>{`${CLASH_STATUS[s].label} ${t.counts[s]}`}</span> : null))}
                    <span className="text-slate-400">{t.lastRunAt ? `run ${fmtDayTime(t.lastRunAt)}` : 'not run yet'}</span>
                  </span>
                </button>
                <span className="flex items-center gap-1">
                  <button type="button" className={primaryBtn} disabled={running === t.id} onClick={() => run(t)}>
                    {running === t.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Run
                  </button>
                  <button type="button" aria-label={`Edit ${t.name}`} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setForm({ id: t.id, name: t.name, selectionA: t.selectionA, selectionB: t.selectionB, toleranceMm: String(Math.round(t.tolerance * 1000)) })}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" aria-label={`Delete ${t.name}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => remove(t)}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {test && (
        <section className={cardCls} aria-label={`Clashes in ${test.name}`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{test.name}</h2>
            <Select className={`${selectCls} ml-auto w-44`} value={status} onChange={setStatus} options={[{ value: '', label: 'Every status' }, ...(Object.keys(CLASH_STATUS) as ClashStatus[]).map((s) => ({ value: s, label: CLASH_STATUS[s].label }))]} aria-label="Status" />
          </div>
          {clashes === null ? (
            <p className="p-4 text-sm text-slate-400">Loading…</p>
          ) : clashes.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{test.lastRunAt ? 'No clashes.' : 'Run the test to find clashes.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">A</th>
                    <th className="px-3 py-2">B</th>
                    <th className="px-3 py-2 text-right">Overlap</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {clashes.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="align-top">
                        <td className="px-3 py-2">
                          <span className="block text-slate-800 dark:text-slate-100">
                            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" aria-hidden />
                            {c.aName ?? c.aGlobalId}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {ifcLabel(c.aType)} · {c.aModel}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="block text-slate-800 dark:text-slate-100">
                            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-600" aria-hidden />
                            {c.bName ?? c.bGlobalId}
                          </span>
                          <span className="block text-xs text-slate-500">
                            {ifcLabel(c.bType)} · {c.bModel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{(c.overlap * 1000).toFixed(0)} mm</td>
                        <td className="w-40 px-3 py-2">
                          <Select className={`${selectCls} h-8 w-full text-xs`} value={c.status} onChange={(v) => setClashStatus(c, v as ClashStatus)} options={(Object.keys(CLASH_STATUS) as ClashStatus[]).map((s) => ({ value: s, label: CLASH_STATUS[s].label }))} aria-label="Clash status" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="flex flex-wrap justify-end gap-2 text-xs font-medium">
                            <button type="button" className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => show(c)}>
                              <Box size={12} /> Show
                            </button>
                            {c.issueId ? (
                              <Link href={`/projects/${projectId}?tab=issues`} className="text-slate-600 hover:underline dark:text-slate-300">
                                Issue raised
                              </Link>
                            ) : (
                              <button type="button" className="inline-flex items-center gap-1 text-red-700 hover:underline dark:text-red-400" onClick={() => raise(c)}>
                                <TriangleAlert size={12} /> Raise issue
                              </button>
                            )}
                            <button type="button" className="text-slate-500 hover:underline" onClick={() => setOpen(open === c.id ? null : c.id)}>
                              Notes{c.noteCount ? ` (${c.noteCount})` : ''}
                            </button>
                          </span>
                          {c.note && <span className="mt-1 block text-[11px] text-slate-500">{c.note}</span>}
                        </td>
                      </tr>
                      {open === c.id && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50/70 px-3 py-3 dark:bg-slate-800/30">
                            <CommentThread projectId={projectId} entityType="CLASH" entityId={c.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
