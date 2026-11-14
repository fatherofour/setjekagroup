'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Box, CheckCircle2, Download, FileUp, Layers3, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { downloadFile } from '@/lib/files';
import { cardCls, inputCls, primaryBtn, secondaryBtn } from '@/lib/architect';
import { scoreTone, type BimModel, type BimElement, type Facets } from '@/lib/bim';
import { ModelViewer, type ViewerFocus } from '@/components/design/ModelsPanel';
import type { Vocabulary } from './SelectionEditor';
import { ElementsView } from './ElementsView';
import { ClashView } from './ClashView';
import { SmartViewsView } from './SmartViewsView';
import { RequirementsView } from './RequirementsView';

interface Hub {
  models: { documentId: string; name: string; discipline: string | null; revision: string | null; status: 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED'; elements: number; storeys: string[]; error: string | null; issues: number }[];
  federations: number;
  clashes: { NEW: number; ACTIVE: number; RESOLVED: number; APPROVED: number; open: number; tests: { id: string; name: string; lastRunAt: string | null; counts: Record<string, number> }[] };
  modelIssues: { total: number; open: number };
  requirements: { id: string; name: string; lastScore: number | null; lastRunAt: string | null; model: string | null }[];
  smartViews: number;
  bcfIssues: number;
}
interface Federation {
  id: string;
  name: string;
  documentIds: string[];
  createdBy: { fullName: string };
}

export interface HubContext {
  projectId: string;
  models: BimModel[];
  vocab: Vocabulary;
  modelName: (id: string) => string;
  openViewer: (documentIds: string[], opts?: { focus?: ViewerFocus; view?: string }) => void;
}

const VIEWS = [
  ['coordination', 'Coordination'],
  ['elements', 'Elements & quantities'],
  ['clashes', 'Clash detection'],
  ['views', 'Smart views'],
  ['requirements', 'BIM requirements'],
] as const;
type View = (typeof VIEWS)[number][0];
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);

/** The BIM hub and coordination hub (chosen from OpenConstructionERP): the
 * models read into elements on the server, with federations, clash
 * detection, smart views, BIM requirement checks and BCF exchange. */
export function BimHubPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [view, setView] = useState<View>('coordination');
  const [models, setModels] = useState<BimModel[] | null>(null);
  const [vocab, setVocab] = useState<Vocabulary>({ models: [], types: [], storeys: [], fields: [] });
  const [viewer, setViewer] = useState<{ models: { id: string; revisionId: string; name: string }[]; focus?: ViewerFocus; view?: string } | null>(null);

  const loadModels = useCallback(() => {
    authedFetch<BimModel[]>(`/projects/${projectId}/models`)
      .then(setModels)
      .catch(() => setModels([]));
  }, [authedFetch, projectId]);
  useEffect(loadModels, [loadModels]);

  // The words the rule editors offer: classes, storeys and property names
  // from the elements read off each model.
  useEffect(() => {
    if (!models?.length) return;
    let live = true;
    Promise.all(models.map((m) => authedFetch<{ facets: Facets; items: BimElement[] }>(`/projects/${projectId}/bim/elements?documentId=${m.id}`).catch(() => null))).then((all) => {
      if (!live) return;
      const types = new Set<string>();
      const storeys = new Set<string>();
      const fields = new Set<string>();
      for (const r of all) {
        r?.facets.types.forEach((t) => types.add(t.value));
        r?.facets.storeys.forEach((s) => s.value && storeys.add(s.value));
        r?.items.forEach((e) => {
          Object.keys(e.properties ?? {}).forEach((k) => fields.add(`property:${k}`));
          Object.keys(e.quantities ?? {}).forEach((k) => fields.add(`quantity:${k}`));
        });
      }
      setVocab({ models: models.map((m) => ({ id: m.id, name: m.name })), types: [...types].sort(), storeys: [...storeys].sort(), fields: [...fields].sort() });
    });
    return () => {
      live = false;
    };
  }, [authedFetch, projectId, models]);

  const modelName = useCallback((id: string) => models?.find((m) => m.id === id)?.name ?? 'a removed model', [models]);
  const openViewer = useCallback(
    (documentIds: string[], opts?: { focus?: ViewerFocus; view?: string }) => {
      const docs = (models ?? []).filter((m) => documentIds.includes(m.id) && m.revisions[0]);
      if (docs.length) setViewer({ models: docs.map((m) => ({ id: m.id, revisionId: m.revisions[0].id, name: `${m.name} rev ${m.revisions[0].revisionNumber}` })), ...opts });
    },
    [models],
  );

  if (viewer) return <ModelViewer projectId={projectId} models={viewer.models} readOnly={false} focus={viewer.focus} initialView={viewer.view} onClose={() => setViewer(null)} />;

  const ctx: HubContext = { projectId, models: models ?? [], vocab, modelName, openViewer };
  return (
    <div className="space-y-4">
      <div className="flex max-w-full overflow-x-auto">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="tablist" aria-label="BIM hub">
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {models === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : models.length === 0 ? (
        <section className={`${cardCls} p-6 text-center text-sm text-slate-500`}>No models yet. Upload IFC models on the Models tab; they are read into the hub automatically.</section>
      ) : view === 'coordination' ? (
        <Coordination ctx={ctx} onGo={setView} onReload={loadModels} />
      ) : view === 'elements' ? (
        <ElementsView ctx={ctx} />
      ) : view === 'clashes' ? (
        <ClashView ctx={ctx} />
      ) : view === 'views' ? (
        <SmartViewsView ctx={ctx} />
      ) : (
        <RequirementsView ctx={ctx} />
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone, onClick }: { label: string; value: string | number; sub?: string; tone?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={`${cardCls} p-3 text-left enabled:hover:border-emerald-500`}>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone ?? 'text-slate-900 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </button>
  );
}

function Coordination({ ctx, onGo, onReload }: { ctx: HubContext; onGo: (v: View) => void; onReload: () => void }) {
  const { authedFetch, accessToken } = useAuth();
  const { projectId, models, modelName, openViewer } = ctx;
  const [hub, setHub] = useState<Hub | null>(null);
  const [feds, setFeds] = useState<Federation[]>([]);
  const [editing, setEditing] = useState<{ id?: string; name: string; documentIds: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bcfMsg, setBcfMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bcfRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    authedFetch<Hub>(`/projects/${projectId}/bim/hub`)
      .then(setHub)
      .catch((e) => setError(err(e, 'Could not load the hub')));
    authedFetch<Federation[]>(`/projects/${projectId}/bim/federations`)
      .then(setFeds)
      .catch(() => setFeds([]));
  }, [authedFetch, projectId]);
  useEffect(load, [load]);

  // Poll while a model is still being read.
  const reading = hub?.models.some((m) => m.status === 'QUEUED' || m.status === 'PROCESSING');
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [reading, load]);

  async function saveFed() {
    if (!editing) return;
    setError(null);
    try {
      setFeds(await authedFetch<Federation[]>(editing.id ? `/projects/${projectId}/bim/federations/${editing.id}` : `/projects/${projectId}/bim/federations`, { method: editing.id ? 'PATCH' : 'POST', body: { name: editing.name.trim(), documentIds: editing.documentIds } }));
      setEditing(null);
      load();
    } catch (e) {
      setError(err(e, 'Could not save the federation'));
    }
  }

  async function removeFed(f: Federation) {
    if (!confirm(`Delete the federation "${f.name}"? The models stay.`)) return;
    try {
      setFeds(await authedFetch<Federation[]>(`/projects/${projectId}/bim/federations/${f.id}`, { method: 'DELETE' }));
    } catch (e) {
      setError(err(e, 'Could not delete it'));
    }
  }

  async function reprocess(documentId: string) {
    const rev = models.find((m) => m.id === documentId)?.revisions[0];
    if (!rev) return;
    await authedFetch(`/projects/${projectId}/bim/revisions/${rev.id}/reprocess`, { method: 'POST' }).catch((e) => setError(err(e, 'Could not queue it')));
    load();
  }

  async function importBcf(file: File) {
    setBusy(true);
    setBcfMsg(null);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await authedFetch<{ created: number; updated: number; linked: number; unmatched: number }>(`/projects/${projectId}/bim/bcf`, { method: 'POST', formData: fd });
      setBcfMsg(`${r.created} new issue${r.created === 1 ? '' : 's'}, ${r.updated} updated, ${r.linked} element link${r.linked === 1 ? '' : 's'} made${r.unmatched ? `; ${r.unmatched} element${r.unmatched === 1 ? ' was' : 's were'} not found in the current models` : ''}.`);
      load();
    } catch (e) {
      setError(err(e, 'The BCF file could not be read'));
    } finally {
      setBusy(false);
      if (bcfRef.current) bcfRef.current.value = '';
    }
  }

  if (!hub) return <p className="text-sm text-slate-400">{error ?? 'Loading…'}</p>;
  const done = hub.models.filter((m) => m.status === 'DONE');
  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Models read" value={`${done.length}/${hub.models.length}`} sub={`${done.reduce((t, m) => t + m.elements, 0).toLocaleString('en-GB')} elements`} onClick={() => onGo('elements')} />
        <Stat label="Open clashes" value={hub.clashes.open} sub={`${hub.clashes.RESOLVED} resolved · ${hub.clashes.APPROVED} approved`} tone={hub.clashes.open ? 'text-red-700 dark:text-red-400' : undefined} onClick={() => onGo('clashes')} />
        <Stat label="Model issues open" value={hub.modelIssues.open} sub={`${hub.modelIssues.total} raised · ${hub.bcfIssues} via BCF`} tone={hub.modelIssues.open ? 'text-amber-700 dark:text-amber-400' : undefined} />
        <Stat label="Federations" value={hub.federations} />
        <Stat label="Smart views" value={hub.smartViews} onClick={() => onGo('views')} />
        <Stat
          label="Requirements score"
          value={hub.requirements.some((r) => r.lastScore != null) ? `${Math.round(hub.requirements.filter((r) => r.lastScore != null).reduce((t, r) => t + r.lastScore!, 0) / hub.requirements.filter((r) => r.lastScore != null).length)}%` : '—'}
          sub={`${hub.requirements.length} set${hub.requirements.length === 1 ? '' : 's'}`}
          tone={scoreTone(hub.requirements.find((r) => r.lastScore != null)?.lastScore)}
          onClick={() => onGo('requirements')}
        />
      </div>

      <section className={cardCls} aria-label="Models in the hub">
        <div className="flex items-center justify-between border-b border-slate-100 p-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Models</h2>
          <button type="button" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700" onClick={() => (load(), onReload())}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Rev</th>
                <th className="px-3 py-2">Read</th>
                <th className="px-3 py-2">Elements</th>
                <th className="px-3 py-2">Storeys</th>
                <th className="px-3 py-2">Issues</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {hub.models.map((m) => (
                <tr key={m.documentId}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{m.name}</span>
                    {m.discipline && <span className="block text-xs text-slate-500">{m.discipline}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{m.revision}</td>
                  <td className="px-3 py-2 text-xs">
                    {m.status === 'DONE' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 size={12} /> Read
                      </span>
                    ) : m.status === 'FAILED' ? (
                      <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400" title={m.error ?? undefined}>
                        <AlertTriangle size={12} /> Failed
                        <button type="button" className="ml-1 underline" onClick={() => reprocess(m.documentId)}>
                          Try again
                        </button>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Loader2 size={12} className="animate-spin" /> {m.status === 'PROCESSING' ? 'Reading…' : 'Queued'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{m.elements.toLocaleString('en-GB')}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{m.storeys.join(', ') || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{m.issues}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => openViewer([m.documentId])}>
                      <Box size={12} /> Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cardCls} p-4`} aria-label="Federations">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Layers3 size={15} /> Federations
            </h2>
            {!editing && (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setEditing({ name: '', documentIds: [] })}>
                <Plus size={13} /> New federation
              </button>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Saved sets of models opened together - architecture with structure and services - for coordination.</p>
          {editing && (
            <div className="mt-3 space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
              <input className={inputCls} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Full coordination model" maxLength={80} aria-label="Federation name" />
              <div className="flex flex-wrap gap-1.5">
                {models.map((m) => {
                  const on = editing.documentIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setEditing({ ...editing, documentIds: on ? editing.documentIds.filter((x) => x !== m.id) : [...editing.documentIds, m.id] })}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                    >
                      {m.name}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button type="button" className={primaryBtn} disabled={!editing.name.trim() || !editing.documentIds.length} onClick={saveFed}>
                  Save
                </button>
                <button type="button" className={secondaryBtn} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <ul className="mt-3 space-y-1.5">
            {feds.length === 0 && !editing && <li className="text-xs text-slate-400">None yet.</li>}
            {feds.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-sm dark:bg-slate-800/50">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 dark:text-slate-100">{f.name}</span>
                  <span className="block truncate text-xs text-slate-500">{f.documentIds.map(modelName).join(' + ')}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button type="button" className={secondaryBtn} onClick={() => openViewer(f.documentIds)}>
                    <Box size={14} /> Open
                  </button>
                  <button type="button" aria-label={`Edit ${f.name}`} className="rounded p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => setEditing({ id: f.id, name: f.name, documentIds: f.documentIds })}>
                    <Pencil size={13} />
                  </button>
                  <button type="button" aria-label={`Delete ${f.name}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => removeFed(f)}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${cardCls} p-4`} aria-label="BCF">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">BCF exchange</h2>
          <p className="mt-0.5 text-xs text-slate-500">Send the model issues - with their elements and camera views - to Revit, ArchiCAD, Solibri or Navisworks as BCF 2.1, and bring their topics back in as issues linked to the same elements.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={secondaryBtn} disabled={!hub.modelIssues.total} onClick={() => downloadFile(`/projects/${projectId}/bim/bcf`, accessToken, 'Model issues.bcfzip').catch((e) => setError(err(e, 'Could not export')))}>
              <Download size={14} /> Export issues (.bcfzip)
            </button>
            <button type="button" className={secondaryBtn} disabled={busy} onClick={() => bcfRef.current?.click()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Import BCF
            </button>
            <input ref={bcfRef} type="file" accept=".bcf,.bcfzip,.zip" className="hidden" aria-label="Choose a BCF file" onChange={(e) => e.target.files?.[0] && importBcf(e.target.files[0])} />
          </div>
          {bcfMsg && (
            <p className="mt-2 flex items-start justify-between gap-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" role="status">
              {bcfMsg}
              <button type="button" aria-label="Dismiss" onClick={() => setBcfMsg(null)}>
                <X size={12} />
              </button>
            </p>
          )}
          {hub.requirements.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requirement checks</h3>
              <ul className="mt-1 space-y-1 text-xs">
                {hub.requirements.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="text-slate-700 dark:text-slate-200">{r.name}</span>
                    <span className={`font-semibold tabular-nums ${scoreTone(r.lastScore)}`}>{r.lastScore == null ? 'not checked' : `${r.lastScore}%`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
