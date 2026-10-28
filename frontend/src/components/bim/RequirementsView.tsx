'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileUp, Loader2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardCls, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls } from '@/lib/architect';
import { NO_VALUE, OP_LABEL, fieldLabel, ifcLabel, scoreTone, type Condition } from '@/lib/bim';
import { ConditionsEditor } from './SelectionEditor';
import type { HubContext } from './BimHubPanel';

interface Requirement {
  id: string;
  name: string;
  description?: string;
  applicability: { ifcTypes?: string[]; conditions?: Condition[] };
  checks: Condition[];
}
interface RequirementSet {
  id: string;
  name: string;
  source: 'IDS' | 'EXCEL' | 'MANUAL';
  fileName: string | null;
  requirements: Requirement[];
  createdBy: { fullName: string };
  checks: { id: string; score: number; ranAt: string; revisionId: string; revision: { revisionNumber: string; document: { id: string; name: string } } }[];
}
interface Result {
  requirementId: string;
  name: string;
  applicable: number;
  passed: number;
  failed: number;
  failing: { globalId: string; name: string | null; ifcType: string; problems: string[] }[];
}
interface Check {
  id: string;
  score: number;
  ranAt?: string;
  results: Result[];
}
const SOURCE = { IDS: 'IDS file', EXCEL: 'Spreadsheet', MANUAL: 'Written here' };
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const blankReq = (): { name: string; types: string; checks: Condition[] } => ({ name: '', types: '', checks: [{ field: 'property:', op: 'exists' }] });

/** BIM requirements: what the models must carry (from an IDS file, a
 * spreadsheet, or written here), checked element by element with a score. */
export function RequirementsView({ ctx }: { ctx: HubContext }) {
  const { authedFetch } = useAuth();
  const { projectId, models, vocab } = ctx;
  const [sets, setSets] = useState<RequirementSet[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [revisionId, setRevisionId] = useState(models[0]?.revisions[0]?.id ?? '');
  const [checkFor, setCheckFor] = useState<{ setId: string; check: Check } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ id?: string; name: string; reqs: ReturnType<typeof blankReq>[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    authedFetch<RequirementSet[]>(`/projects/${projectId}/bim/requirements`)
      .then((s) => {
        setSets(s);
        setCurrent((c) => c ?? s[0]?.id ?? null);
      })
      .catch((e) => setError(err(e, 'Could not load the requirements')));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  const set = sets?.find((s) => s.id === current) ?? null;
  const check = set && checkFor?.setId === set.id ? checkFor.check : null;

  // Show the newest check of the chosen set.
  useEffect(() => {
    const last = set?.checks[0];
    if (!set || !last) return;
    authedFetch<Check>(`/projects/${projectId}/bim/requirements/checks/${last.id}`)
      .then((c) => setCheckFor({ setId: set.id, check: c }))
      .catch(() => undefined);
  }, [authedFetch, projectId, set]);

  async function importFile(file: File) {
    setBusy(true);
    setMsg(null);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await authedFetch<{ id: string; requirements: number; skipped: string[] }>(`/projects/${projectId}/bim/requirements/import`, { method: 'POST', formData: fd });
      setMsg(`${r.requirements} requirement${r.requirements === 1 ? '' : 's'} imported from ${file.name}.${r.skipped.length ? ` Left out: ${r.skipped.slice(0, 5).join('; ')}${r.skipped.length > 5 ? '…' : ''}.` : ''}`);
      setCurrent(r.id);
      load();
    } catch (e) {
      setError(err(e, 'The file could not be imported'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function run() {
    if (!set || !revisionId) return;
    setBusy(true);
    setError(null);
    try {
      setCheckFor({ setId: set.id, check: await authedFetch<Check>(`/projects/${projectId}/bim/requirements/${set.id}/run`, { method: 'POST', body: { revisionId } }) });
      load();
    } catch (e) {
      setError(err(e, 'The check could not run'));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form) return;
    setError(null);
    const requirements = form.reqs
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        applicability: { ifcTypes: r.types.split(/[,;]/).map((t) => t.trim().toUpperCase()).filter(Boolean).map((t) => (t.startsWith('IFC') ? t : `IFC${t.replace(/\s+/g, '')}`)) },
        checks: r.checks.filter((c) => c.field.trim() && c.field !== 'property:'),
      }));
    try {
      const r = await authedFetch<{ id: string }>(form.id ? `/projects/${projectId}/bim/requirements/${form.id}` : `/projects/${projectId}/bim/requirements`, { method: form.id ? 'PATCH' : 'POST', body: { name: form.name.trim(), requirements } });
      setForm(null);
      setCurrent(r.id);
      load();
    } catch (e) {
      setError(err(e, 'Could not save the requirements'));
    }
  }

  async function remove(s: RequirementSet) {
    if (!confirm(`Delete "${s.name}" and its check history?`)) return;
    try {
      await authedFetch(`/projects/${projectId}/bim/requirements/${s.id}`, { method: 'DELETE' });
      setCurrent(null);
      load();
    } catch (e) {
      setError(err(e, 'Could not delete it'));
    }
  }

  const revOptions = models.flatMap((m) => m.revisions.map((r, i) => ({ value: r.id, label: `${m.name} rev ${r.revisionNumber}${i === 0 ? ' (current)' : ''}` })));
  const reqById = new Map((set?.requirements ?? []).map((r) => [r.id, r]));

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">BIM requirements</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              What the models must carry - fire ratings on walls, a name on every door. Import a buildingSMART IDS file or a spreadsheet (columns: Requirement, IFC type, Property, Rule, Value), or write them here, then check a model revision.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Import IDS / Excel
            </button>
            <input ref={fileRef} type="file" accept=".ids,.xml,.xlsx,.csv" className="hidden" aria-label="Choose a requirements file" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            {!form && (
              <button type="button" className={primaryBtn} onClick={() => setForm({ name: '', reqs: [blankReq()] })}>
                <Plus size={14} /> Write requirements
              </button>
            )}
          </div>
        </div>
        {msg && <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{msg}</p>}
        {form && (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <label className={labelCls}>
              Name of the set
              <input className={`${inputCls} mt-0.5`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Setjeka model standard" maxLength={120} />
            </label>
            {form.reqs.map((r, i) => (
              <fieldset key={i} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Requirement {i + 1}</legend>
                <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input className={inputCls} value={r.name} onChange={(e) => setForm({ ...form, reqs: form.reqs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Walls carry a fire rating" aria-label="Requirement" />
                  <input className={inputCls} list="bim-types" value={r.types} onChange={(e) => setForm({ ...form, reqs: form.reqs.map((x, j) => (j === i ? { ...x, types: e.target.value } : x)) })} placeholder="Applies to: IfcWall, IfcDoor (blank = all)" aria-label="Applies to" />
                  {form.reqs.length > 1 && (
                    <button type="button" aria-label="Remove requirement" className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => setForm({ ...form, reqs: form.reqs.filter((_, j) => j !== i) })}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <ConditionsEditor value={r.checks} onChange={(checks) => setForm({ ...form, reqs: form.reqs.map((x, j) => (j === i ? { ...x, checks } : x)) })} fields={vocab.fields} addLabel="Add what it must carry" />
              </fieldset>
            ))}
            <datalist id="bim-types">
              {vocab.types.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryBtn} onClick={() => setForm({ ...form, reqs: [...form.reqs, blankReq()] })}>
                <Plus size={14} /> Another requirement
              </button>
              <button type="button" className={primaryBtn} disabled={!form.name.trim() || !form.reqs.some((r) => r.name.trim())} onClick={save}>
                Save
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {sets && sets.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <section className={cardCls} aria-label="Requirement sets">
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {sets.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setCurrent(s.id)} className={`w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 ${s.id === current ? 'bg-emerald-50/60 dark:bg-emerald-950/30' : ''}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.name}</span>
                      <span className={`text-sm font-semibold tabular-nums ${scoreTone(s.checks[0]?.score)}`}>{s.checks[0] ? `${s.checks[0].score}%` : '—'}</span>
                    </span>
                    <span className="block text-xs text-slate-500">
                      {s.requirements.length} requirement{s.requirements.length === 1 ? '' : 's'} · {SOURCE[s.source]}
                      {s.fileName ? ` (${s.fileName})` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {set && (
            <section className={`${cardCls} p-4`} aria-label={set.name}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-sm font-semibold text-slate-900 dark:text-slate-100">{set.name}</h2>
                <Select className={`${selectCls} w-72`} value={revisionId} onChange={setRevisionId} options={revOptions} aria-label="Model revision to check" />
                <button type="button" className={primaryBtn} disabled={busy || !revisionId} onClick={run}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Check
                </button>
                {set.source === 'MANUAL' && (
                  <button
                    type="button"
                    aria-label="Edit"
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setForm({ id: set.id, name: set.name, reqs: set.requirements.map((r) => ({ name: r.name, types: (r.applicability.ifcTypes ?? []).join(', '), checks: r.checks })) })}
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button type="button" aria-label="Delete set" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => remove(set)}>
                  <Trash2 size={14} />
                </button>
              </div>
              {set.checks.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  History: {set.checks.slice(0, 6).map((c) => `${c.score}% on ${c.revision.document.name} rev ${c.revision.revisionNumber} (${fmtDayTime(c.ranAt)})`).join(' · ')}
                </p>
              )}
              {check ? (
                <>
                  <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                    Score <strong className={`text-lg tabular-nums ${scoreTone(check.score)}`}>{check.score}%</strong> of the elements each requirement applies to pass.
                  </p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="w-8 px-2 py-2" />
                          <th className="px-2 py-2">Requirement</th>
                          <th className="px-2 py-2 text-right">Applies to</th>
                          <th className="px-2 py-2 text-right">Pass</th>
                          <th className="px-2 py-2 text-right">Fail</th>
                          <th className="w-40 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {check.results.map((r) => {
                          const pct = r.applicable ? Math.round((r.passed / r.applicable) * 100) : null;
                          const req = reqById.get(r.requirementId);
                          const ex = open === r.requirementId;
                          return (
                            <Fragment key={r.requirementId}>
                              <tr className="cursor-pointer align-top hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setOpen(ex ? null : r.requirementId)}>
                                <td className="px-2 py-2 text-slate-400">{r.failed ? ex ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : null}</td>
                                <td className="px-2 py-2">
                                  <span className="block text-slate-800 dark:text-slate-100">{r.name}</span>
                                  {req && (
                                    <span className="block text-xs text-slate-500">
                                      {(req.applicability.ifcTypes ?? []).map(ifcLabel).join(', ') || 'All elements'}: {req.checks.map((c) => `${fieldLabel(c.field)} ${OP_LABEL[c.op]}${NO_VALUE.includes(c.op) ? '' : ` "${c.value ?? ''}"`}`).join('; ')}
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">{r.applicable}</td>
                                <td className="px-2 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{r.passed}</td>
                                <td className="px-2 py-2 text-right tabular-nums text-red-700 dark:text-red-400">{r.failed}</td>
                                <td className="px-2 py-2">
                                  {pct === null ? (
                                    <span className="text-xs text-slate-400">nothing it applies to</span>
                                  ) : (
                                    <span className="flex items-center gap-2">
                                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-red-100 dark:bg-red-950" aria-hidden>
                                        <span className="block h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                                      </span>
                                      <span className={`w-10 text-right text-xs font-semibold tabular-nums ${scoreTone(pct)}`}>{pct}%</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {ex && r.failing.length > 0 && (
                                <tr>
                                  <td />
                                  <td colSpan={5} className="bg-slate-50/70 px-2 pb-3 pt-1 dark:bg-slate-800/30">
                                    <ul className="max-h-72 space-y-0.5 overflow-y-auto text-xs">
                                      {r.failing.map((f) => (
                                        <li key={f.globalId} className="text-slate-700 dark:text-slate-200">
                                          {ifcLabel(f.ifcType)} · {f.name ?? f.globalId} - <span className="text-red-700 dark:text-red-400">{f.problems.join('; ')}</span>
                                        </li>
                                      ))}
                                    </ul>
                                    {r.failed > r.failing.length && <p className="mt-1 text-[11px] text-slate-400">First {r.failing.length} of {r.failed} shown.</p>}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Not checked yet. Choose a model revision and press Check.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
