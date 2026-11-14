'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, GitCompare, Loader2, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { downloadFile } from '@/lib/files';
import { cardCls, inputCls, primaryBtn, secondaryBtn, selectCls } from '@/lib/architect';
import { ifcLabel, type BimElement, type Facets } from '@/lib/bim';
import type { HubContext } from './BimHubPanel';

interface Page {
  revisionId: string | null;
  total: number;
  page: number;
  items: BimElement[];
  facets: Facets;
}
interface QtyRow {
  ifcType: string;
  count: number;
  storeys: string[];
  quantities: Record<string, number>;
}
interface Diff {
  from: string;
  to: string;
  added: { globalId: string; ifcType: string; name: string | null; storey: string | null }[];
  removed: Diff['added'];
  changed: (Diff['added'][number] & { what: string[] })[];
  unchanged: number;
}
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const num = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

/** Every element of a model with its properties and quantities, quantities
 * summed by class, and what changed between two revisions. */
export function ElementsView({ ctx }: { ctx: HubContext }) {
  const { authedFetch, accessToken } = useAuth();
  const { projectId, models } = ctx;
  // Start on the model with the newest upload: the one just revised.
  const [docId, setDocId] = useState(() => [...models].sort((a, b) => (b.revisions[0]?.uploadedAt ?? '').localeCompare(a.revisions[0]?.uploadedAt ?? ''))[0]?.id ?? '');
  const model = models.find((m) => m.id === docId);
  const [revisionId, setRevisionId] = useState(model?.revisions[0]?.id ?? '');
  const [tab, setTab] = useState<'elements' | 'quantities' | 'changes'>('elements');
  const [type, setType] = useState('');
  const [storey, setStorey] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [qtyFor, setQtyFor] = useState<{ revisionId: string; rows: QtyRow[] } | null>(null);
  const qty = qtyFor?.revisionId === revisionId ? qtyFor.rows : null;
  const [from, setFrom] = useState(model?.revisions[1]?.id ?? '');
  const [diff, setDiff] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseModel(id: string) {
    const m = models.find((x) => x.id === id);
    setDocId(id);
    setRevisionId(m?.revisions[0]?.id ?? '');
    setFrom(m?.revisions[1]?.id ?? '');
    setType('');
    setStorey('');
    setPage(0);
    setDiff(null);
  }

  useEffect(() => {
    if (!revisionId || tab !== 'elements') return;
    const p = new URLSearchParams({ revisionId, page: String(page) });
    if (type) p.set('ifcType', type);
    if (storey) p.set('storey', storey);
    if (query) p.set('q', query);
    authedFetch<Page>(`/projects/${projectId}/bim/elements?${p}`)
      .then((d) => (setData(d), setError(null)))
      .catch((e) => setError(err(e, 'Could not load the elements')));
  }, [authedFetch, projectId, revisionId, type, storey, query, page, tab]);

  useEffect(() => {
    if (!revisionId || tab !== 'quantities') return;
    authedFetch<QtyRow[]>(`/projects/${projectId}/bim/quantities?revisionId=${revisionId}`)
      .then((rows) => setQtyFor({ revisionId, rows }))
      .catch((e) => setError(err(e, 'Could not total the quantities')));
  }, [authedFetch, projectId, revisionId, tab]);

  const qtyKeys = useMemo(() => [...new Set((qty ?? []).flatMap((r) => Object.keys(r.quantities)))].sort(), [qty]);

  async function compare() {
    if (!from || !revisionId || from === revisionId) return;
    setBusy(true);
    setError(null);
    try {
      setDiff(await authedFetch<Diff>(`/projects/${projectId}/bim/diff?documentId=${docId}&from=${from}&to=${revisionId}`));
    } catch (e) {
      setError(err(e, 'Could not compare the revisions'));
    } finally {
      setBusy(false);
    }
  }

  const revOptions = (model?.revisions ?? []).map((r) => ({ value: r.id, label: `Rev ${r.revisionNumber}` }));
  const pages = data ? Math.ceil(data.total / 100) : 0;

  return (
    <div className="space-y-4">
      <section className={`${cardCls} flex flex-wrap items-center gap-2 p-3`}>
        <Select className={`${selectCls} w-64`} value={docId} onChange={chooseModel} options={models.map((m) => ({ value: m.id, label: m.name }))} aria-label="Model" />
        <Select className={`${selectCls} w-28`} value={revisionId} onChange={(v) => (setRevisionId(v), setPage(0))} options={revOptions} aria-label="Revision" />
        <div className="ml-auto inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="tablist" aria-label="Show">
          {(
            [
              ['elements', 'Elements'],
              ['quantities', 'Quantities'],
              ['changes', 'Changes'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`rounded-md px-3 py-1 text-sm font-medium ${tab === v ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {l}
            </button>
          ))}
        </div>
        <button type="button" className={secondaryBtn} disabled={!revisionId} onClick={() => downloadFile(`/projects/${projectId}/bim/elements.xlsx?revisionId=${revisionId}`, accessToken, `${model?.name ?? 'Model'} elements.xlsx`).catch((e) => setError(err(e, 'Could not export')))}>
          <Download size={14} /> Excel
        </button>
      </section>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {tab === 'elements' && (
        <section className={cardCls} aria-label="Elements">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
            <form
              className="relative"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(q.trim());
                setPage(0);
              }}
            >
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} w-64 pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, type, material or GlobalId" aria-label="Search elements" />
            </form>
            <Select className={`${selectCls} w-56`} value={type} onChange={(v) => (setType(v), setPage(0))} options={[{ value: '', label: 'Every class' }, ...(data?.facets.types ?? []).map((t) => ({ value: t.value, label: `${ifcLabel(t.value)} (${t.count})` }))]} aria-label="IFC class" />
            <Select className={`${selectCls} w-44`} value={storey} onChange={(v) => (setStorey(v), setPage(0))} options={[{ value: '', label: 'Every storey' }, ...(data?.facets.storeys ?? []).filter((s) => s.value).map((s) => ({ value: s.value!, label: `${s.value} (${s.count})` }))]} aria-label="Storey" />
            <span className="ml-auto text-xs text-slate-500">{busy ? <Loader2 size={12} className="inline animate-spin" /> : data ? `${data.total.toLocaleString('en-GB')} elements` : ''}</span>
          </div>
          {data && data.revisionId === null ? (
            <p className="p-4 text-sm text-slate-500">This model has not been read yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="w-8 px-3 py-2" />
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Storey</th>
                    <th className="px-3 py-2">Material</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(data?.items ?? []).map((e) => {
                    const ex = open === e.id;
                    return (
                      <Fragment key={e.id}>
                        <tr className="cursor-pointer align-top hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setOpen(ex ? null : e.id)}>
                          <td className="px-3 py-2 text-slate-400">{ex ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                          <td className="px-3 py-2 text-xs">{ifcLabel(e.ifcType)}</td>
                          <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{e.name ?? '—'}</td>
                          <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{e.typeName ?? '—'}</td>
                          <td className="px-3 py-2 text-xs">{e.storey ?? '—'}</td>
                          <td className="max-w-[16rem] truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-300" title={e.material ?? undefined}>
                            {e.material ?? '—'}
                          </td>
                        </tr>
                        {ex && (
                          <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                            <td />
                            <td colSpan={5} className="px-3 pb-3 pt-1">
                              <p className="mb-1 font-mono text-[11px] text-slate-400">GlobalId {e.globalId}</p>
                              <div className="grid gap-4 md:grid-cols-2">
                                <dl className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px]">
                                  {Object.entries(e.properties).map(([k, v]) => (
                                    <Fragment key={k}>
                                      <dt className="truncate text-slate-500" title={k}>
                                        {k}
                                      </dt>
                                      <dd className="truncate text-slate-800 dark:text-slate-100">{String(v)}</dd>
                                    </Fragment>
                                  ))}
                                  {!Object.keys(e.properties).length && <dd className="col-span-2 text-slate-400">No properties</dd>}
                                </dl>
                                <dl className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[11px]">
                                  {Object.entries(e.quantities).map(([k, v]) => (
                                    <Fragment key={k}>
                                      <dt className="truncate text-slate-500">{k}</dt>
                                      <dd className="tabular-nums text-slate-800 dark:text-slate-100">{num(v)}</dd>
                                    </Fragment>
                                  ))}
                                  {!Object.keys(e.quantities).length && <dd className="col-span-2 text-slate-400">No quantity sets in the model</dd>}
                                </dl>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-2 text-xs dark:border-slate-800">
              <button type="button" className={secondaryBtn} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span className="tabular-nums text-slate-500">
                Page {page + 1} of {pages}
              </span>
              <button type="button" className={secondaryBtn} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'quantities' && (
        <section className={cardCls} aria-label="Quantities">
          <p className="border-b border-slate-100 p-3 text-xs text-slate-500 dark:border-slate-800">Counts by class, and the lengths, areas and volumes the model carries in its quantity sets (where the author exported them).</p>
          {qty === null ? (
            <p className="p-4 text-sm text-slate-400">Totalling…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Class</th>
                    <th className="px-3 py-2 text-right">Count</th>
                    {qtyKeys.map((k) => (
                      <th key={k} className="px-3 py-2 text-right">
                        {k.replace(/([a-z])([A-Z])/g, '$1 $2')}
                      </th>
                    ))}
                    <th className="px-3 py-2">Storeys</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {qty.map((r) => (
                    <tr key={r.ifcType}>
                      <td className="px-3 py-2">{ifcLabel(r.ifcType)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                      {qtyKeys.map((k) => (
                        <td key={k} className="px-3 py-2 text-right tabular-nums">
                          {r.quantities[k] != null ? num(r.quantities[k]) : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs text-slate-500">{r.storeys.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'changes' && (
        <section className={`${cardCls} p-4`} aria-label="Changes between revisions">
          {revOptions.length < 2 ? (
            <p className="text-sm text-slate-500">This model has one revision. Upload a new revision on the Models tab to compare.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-300">Compare</span>
                <Select className={`${selectCls} w-28`} value={from} onChange={setFrom} options={revOptions} aria-label="Older revision" />
                <span className="text-sm text-slate-600 dark:text-slate-300">with</span>
                <Select className={`${selectCls} w-28`} value={revisionId} onChange={setRevisionId} options={revOptions} aria-label="Newer revision" />
                <button type="button" className={primaryBtn} disabled={busy || !from || from === revisionId} onClick={compare}>
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <GitCompare size={14} />} Compare
                </button>
              </div>
              {diff && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    From rev {diff.from} to rev {diff.to}: <strong className="text-emerald-700 dark:text-emerald-400">{diff.added.length} added</strong>, <strong className="text-red-700 dark:text-red-400">{diff.removed.length} removed</strong>,{' '}
                    <strong className="text-amber-700 dark:text-amber-400">{diff.changed.length} changed</strong>, {diff.unchanged} unchanged.
                  </p>
                  {(
                    [
                      ['Changed', diff.changed, 'border-amber-400'],
                      ['Added', diff.added, 'border-emerald-400'],
                      ['Removed', diff.removed, 'border-red-400'],
                    ] as const
                  ).map(([label, list, bar]) =>
                    list.length ? (
                      <div key={label} className={`border-l-2 pl-3 ${bar}`}>
                        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {label} ({list.length})
                        </h3>
                        <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto text-xs">
                          {list.slice(0, 300).map((e) => (
                            <li key={e.globalId} className="text-slate-700 dark:text-slate-200">
                              {ifcLabel(e.ifcType)} · {e.name ?? e.globalId}
                              {e.storey && <span className="text-slate-400"> · {e.storey}</span>}
                              {'what' in e && <span className="text-amber-700 dark:text-amber-400"> - {(e as { what: string[] }).what.join(', ')}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
