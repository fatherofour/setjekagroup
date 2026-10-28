'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls } from '@/lib/architect';
import { describeSelection, type Selection } from '@/lib/bim';
import { SelectionEditor } from './SelectionEditor';
import type { HubContext } from './BimHubPanel';

type Action = 'colour' | 'transparent' | 'hide' | 'isolate';
interface Rule {
  label: string;
  selection: Selection;
  action: Action;
  colour?: string;
}
interface SmartView {
  id: string;
  name: string;
  description: string | null;
  rules: Rule[];
  createdBy: { fullName: string };
}
const ACTIONS: { value: Action; label: string }[] = [
  { value: 'colour', label: 'Colour them' },
  { value: 'transparent', label: 'Make them see-through' },
  { value: 'hide', label: 'Hide them' },
  { value: 'isolate', label: 'Show only these' },
];
const SWATCHES = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777'];
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const newRule = (): Rule => ({ label: '', selection: {}, action: 'colour', colour: SWATCHES[0] });

/** Smart views: saved, rule-based ways of looking at the models, applied in
 * the viewer from the element store. */
export function SmartViewsView({ ctx }: { ctx: HubContext }) {
  const { authedFetch } = useAuth();
  const { projectId, vocab, models, modelName, openViewer } = ctx;
  const [views, setViews] = useState<SmartView[] | null>(null);
  const [form, setForm] = useState<{ id?: string; name: string; description: string; rules: Rule[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<SmartView[]>(`/projects/${projectId}/bim/smart-views`)
      .then(setViews)
      .catch((e) => setError(err(e, 'Could not load the smart views')));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  async function save() {
    if (!form) return;
    setError(null);
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || undefined, rules: form.rules.map((r, i) => ({ ...r, label: r.label.trim() || `Rule ${i + 1}`, selection: { ...r.selection, conditions: (r.selection.conditions ?? []).filter((c) => c.field.trim()) }, colour: r.action === 'colour' ? r.colour : undefined })) };
      setViews(await authedFetch<SmartView[]>(form.id ? `/projects/${projectId}/bim/smart-views/${form.id}` : `/projects/${projectId}/bim/smart-views`, { method: form.id ? 'PATCH' : 'POST', body }));
      setForm(null);
    } catch (e) {
      setError(err(e, 'Could not save the smart view'));
    }
  }

  async function remove(v: SmartView) {
    if (!confirm(`Delete the smart view "${v.name}"?`)) return;
    try {
      setViews(await authedFetch<SmartView[]>(`/projects/${projectId}/bim/smart-views/${v.id}`, { method: 'DELETE' }));
    } catch (e) {
      setError(err(e, 'Could not delete it'));
    }
  }

  const setRule = (i: number, patch: Partial<Rule>) => form && setForm({ ...form, rules: form.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const allModels = models.map((m) => m.id);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <section className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Smart views</h2>
            <p className="mt-0.5 text-xs text-slate-500">Saved ways of looking at the models: colour the fire-rated walls, hide the furniture, show only one storey. Rules apply in order. Pick one in the viewer&apos;s toolbar, or open it from here.</p>
          </div>
          {!form && (
            <button type="button" className={primaryBtn} onClick={() => setForm({ name: '', description: '', rules: [newRule()] })}>
              <Plus size={14} /> New smart view
            </button>
          )}
        </div>
        {form && (
          <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={labelCls}>
                Name
                <input className={`${inputCls} mt-0.5`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fire-rated walls" maxLength={80} />
              </label>
              <label className={labelCls}>
                What it is for (optional)
                <input className={`${inputCls} mt-0.5`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
              </label>
            </div>
            {form.rules.map((r, i) => (
              <fieldset key={i} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Rule {i + 1}</legend>
                <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_14rem_auto]">
                  <input className={inputCls} value={r.label} onChange={(e) => setRule(i, { label: e.target.value })} placeholder="Label for the legend" aria-label="Rule label" maxLength={80} />
                  <Select className={`${selectCls} w-full`} value={r.action} onChange={(v) => setRule(i, { action: v as Action })} options={ACTIONS} aria-label="What to do" />
                  {form.rules.length > 1 && (
                    <button type="button" aria-label="Remove rule" className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => setForm({ ...form, rules: form.rules.filter((_, j) => j !== i) })}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {r.action === 'colour' && (
                  <div className="mb-2 flex items-center gap-1.5">
                    {SWATCHES.map((c) => (
                      <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={r.colour === c} onClick={() => setRule(i, { colour: c })} className={`h-6 w-6 rounded-full ${r.colour === c ? 'ring-2 ring-slate-700 ring-offset-1 dark:ring-white dark:ring-offset-slate-900' : ''}`} style={{ background: c }} />
                    ))}
                  </div>
                )}
                <SelectionEditor projectId={projectId} value={r.selection} onChange={(selection) => setRule(i, { selection })} vocab={vocab} />
              </fieldset>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryBtn} disabled={form.rules.length >= 20} onClick={() => setForm({ ...form, rules: [...form.rules, newRule()] })}>
                <Plus size={14} /> Add a rule
              </button>
              <button type="button" className={primaryBtn} disabled={!form.name.trim()} onClick={save}>
                Save smart view
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setForm(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={cardCls} aria-label="Saved smart views">
        {views === null ? (
          <p className="p-4 text-sm text-slate-400">Loading…</p>
        ) : views.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No smart views yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {views.map((v) => (
              <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{v.name}</p>
                  {v.description && <p className="text-xs text-slate-500">{v.description}</p>}
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                    {v.rules.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ background: r.action === 'colour' ? r.colour : r.action === 'transparent' ? 'transparent' : '#e2e8f0' }} />
                        <span>
                          <strong className="font-medium">{r.label}</strong> - {ACTIONS.find((a) => a.value === r.action)?.label.toLowerCase()}: {describeSelection(r.selection, modelName)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="flex items-center gap-1">
                  <button type="button" className={secondaryBtn} onClick={() => openViewer(allModels, { view: v.id })}>
                    <Box size={14} /> Open in viewer
                  </button>
                  <button type="button" aria-label={`Edit ${v.name}`} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setForm({ id: v.id, name: v.name, description: v.description ?? '', rules: v.rules })}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" aria-label={`Delete ${v.name}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => remove(v)}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
