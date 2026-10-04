'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { History, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { RESOURCE_TYPE_LABEL, RESOURCE_TYPE_OPTIONS, UNIT_SUGGESTIONS, formatRate, type CostRegion, type CostResource, type ResourceType } from '@/lib/commercial';

interface HistoryRow {
  id: string;
  rate: number;
  previousRate: number | null;
  source: string | null;
  effectiveDate: string;
  createdAt: string;
  changedBy: { fullName: string } | null;
}

const emptyResource = { code: '', name: '', type: 'MATERIAL' as ResourceType, unit: '', category: '', description: '' };

/** Every material, labour trade and item of plant, with its price in the
 * chosen region. Prices are typed straight into the sheet and saved
 * together; each change keeps a history row. */
export function PriceSheetPanel({ regions, regionId, onRegionChange }: { regions: CostRegion[]; regionId: string; onRegionChange: (id: string) => void }) {
  const { authedFetch } = useAuth();
  const region = regions.find((r) => r.id === regionId) ?? null;
  const [resources, setResources] = useState<CostResource[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | ResourceType>('ALL');
  const [onlyUnpriced, setOnlyUnpriced] = useState(false);
  const [form, setForm] = useState(emptyResource);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    authedFetch<CostResource[]>(`/cost-resources?all=true${regionId ? `&regionId=${regionId}` : ''}`)
      .then((r) => {
        setResources(r);
        setEdits({});
        if (r.length === 0) setAdding(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load resources.'));
  }, [authedFetch, regionId]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => [...new Set((resources ?? []).map((r) => r.category).filter(Boolean) as string[])].sort(), [resources]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (resources ?? []).filter(
      (r) =>
        (typeFilter === 'ALL' || r.type === typeFilter) &&
        (!onlyUnpriced || !r.price) &&
        (!q || `${r.code} ${r.name} ${r.category ?? ''}`.toLowerCase().includes(q)),
    );
  }, [resources, query, typeFilter, onlyUnpriced]);

  const changed = Object.entries(edits).filter(([id, v]) => {
    const r = resources?.find((x) => x.id === id);
    return v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) !== r?.price?.rate;
  });

  async function savePrices() {
    if (!regionId || !changed.length) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await authedFetch<{ changed: number }>(`/cost-regions/${regionId}/prices`, {
        method: 'PUT',
        body: { prices: changed.map(([resourceId, v]) => ({ resourceId, rate: Number(v) })), source: source.trim() || undefined },
      });
      setEdits({});
      setMessage(`${res.changed} price${res.changed === 1 ? '' : 's'} saved for ${region?.name}.`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save prices.');
    } finally {
      setBusy(false);
    }
  }

  async function saveResource(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        unit: form.unit.trim(),
        category: form.category.trim() || (editingId ? null : undefined),
        description: form.description.trim() || (editingId ? null : undefined),
      };
      if (editingId) await authedFetch(`/cost-resources/${editingId}`, { method: 'PATCH', body });
      else await authedFetch('/cost-resources', { method: 'POST', body });
      setForm(emptyResource);
      setEditingId(null);
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the resource.');
    } finally {
      setBusy(false);
    }
  }

  async function resourceAction(r: CostResource, action: 'toggle' | 'delete') {
    setError(null);
    try {
      if (action === 'delete') {
        if (!confirm(`Delete ${r.name} and its prices in every region?`)) return;
        await authedFetch(`/cost-resources/${r.id}`, { method: 'DELETE' });
      } else await authedFetch(`/cost-resources/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  async function toggleHistory(id: string) {
    if (historyFor === id) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(id);
    setHistory(null);
    try {
      setHistory(await authedFetch<HistoryRow[]>(`/cost-resources/${id}/price-history?regionId=${regionId}`));
    } catch {
      setHistory([]);
    }
  }

  const showForm = adding || editingId;
  const priced = (resources ?? []).filter((r) => r.price).length;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}

      <div className={cardClass}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-72">
            <label className={labelClass} htmlFor="sheet-region">
              Region
            </label>
            {regions.length ? (
              <Select id="sheet-region" value={regionId} onChange={onRegionChange} options={regions.map((r) => ({ value: r.id, label: `${r.name} (${r.currency})` }))} className={inputClass} />
            ) : (
              <p className="text-sm text-slate-400">Add a region first, under Regions.</p>
            )}
          </div>
          <div className="flex-1 text-xs text-slate-500 dark:text-slate-400">
            {resources && region && `${priced} of ${resources.length} resources priced in ${region.name}. Prices are in ${region.currency}, per the resource's unit.`}
          </div>
          {!showForm && (
            <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
              <Plus size={14} />
              Add resource
            </button>
          )}
        </div>

        {showForm && (
          <form onSubmit={saveResource} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-6 dark:bg-slate-800/40">
            <p className="text-xs text-slate-500 sm:col-span-6 dark:text-slate-400">
              A resource is anything you price: a material (cement, blocks, sand), a trade&apos;s labour (mason per hour), or plant (concrete mixer per day). It exists once and is priced separately in each region.
            </p>
            <div>
              <label className={labelClass} htmlFor="res-code">
                Code
              </label>
              <input id="res-code" className={inputClass} placeholder="e.g. CEM-50" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="res-name">
                Name
              </label>
              <input id="res-name" className={inputClass} placeholder="e.g. Cement OPC 42.5, 50 kg bag" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="res-type">
                Type
              </label>
              <Select id="res-type" value={form.type} onChange={(v) => setForm({ ...form, type: v as ResourceType })} options={RESOURCE_TYPE_OPTIONS} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="res-unit">
                Unit
              </label>
              <input id="res-unit" list="res-units" className={inputClass} placeholder="e.g. bag" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              <datalist id="res-units">
                {UNIT_SUGGESTIONS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelClass} htmlFor="res-cat">
                Category
              </label>
              <input id="res-cat" list="res-cats" className={inputClass} placeholder="e.g. Cement & binders" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <datalist id="res-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-2 sm:col-span-6">
              <button type="submit" disabled={busy || !form.code.trim() || !form.name.trim() || !form.unit.trim()} className={primaryButton}>
                {busy ? 'Saving…' : editingId ? 'Save resource' : 'Add resource'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setEditingId(null);
                  setForm(emptyResource);
                }}
                className={secondaryButton}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search resources" className={`${inputClass} pl-8`} placeholder="Search code, name or category" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="w-44">
            <Select aria-label="Filter by type" value={typeFilter} onChange={(v) => setTypeFilter(v as 'ALL' | ResourceType)} options={[{ value: 'ALL', label: 'All types' }, ...RESOURCE_TYPE_OPTIONS]} className={inputClass} />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={onlyUnpriced} onChange={(e) => setOnlyUnpriced(e.target.checked)} className="accent-emerald-600" />
            Only unpriced
          </label>
        </div>

        {resources === null ? (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        ) : resources.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">The cost database is empty. Add the materials, labour and plant you price, then enter their prices for each region.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="py-2 pr-2 font-medium">Code</th>
                  <th className="py-2 pr-2 font-medium">Resource</th>
                  <th className="py-2 pr-2 font-medium">Type</th>
                  <th className="py-2 pr-2 font-medium">Unit</th>
                  <th className="w-40 py-2 pr-2 text-right font-medium">Price {region ? `(${region.currency})` : ''}</th>
                  <th className="py-2 pr-2 font-medium">Last set</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const edit = edits[r.id];
                  const dirty = edit !== undefined && edit !== '' && Number(edit) !== r.price?.rate;
                  return (
                    <Fragment key={r.id}>
                      <tr className={`border-b border-slate-100 dark:border-slate-800 ${r.isActive ? '' : 'opacity-50'}`}>
                        <td className="py-1.5 pr-2 font-mono text-xs text-slate-500">{r.code}</td>
                        <td className="py-1.5 pr-2">
                          <span className="text-slate-800 dark:text-slate-100">{r.name}</span>
                          {r.category && <span className="ml-2 text-xs text-slate-400">{r.category}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-slate-500">{RESOURCE_TYPE_LABEL[r.type]}</td>
                        <td className="py-1.5 pr-2 text-xs text-slate-500">{r.unit}</td>
                        <td className="py-1.5 pr-2">
                          <input
                            aria-label={`Price of ${r.name}`}
                            type="number"
                            min={0}
                            step="any"
                            disabled={!regionId}
                            className={`${inputClass} h-8 text-right tabular-nums ${dirty ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30' : ''}`}
                            placeholder="Not priced"
                            value={edit ?? r.price?.rate?.toString() ?? ''}
                            onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })}
                          />
                        </td>
                        <td className="py-1.5 pr-2 text-[11px] text-slate-400">
                          {r.price ? (
                            <>
                              {new Date(r.price.updatedAt).toLocaleDateString()}
                              {r.price.source && <span className="block truncate" title={r.price.source}>{r.price.source}</span>}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right">
                          <button type="button" aria-label={`Price history for ${r.name}`} onClick={() => toggleHistory(r.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <History size={13} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Edit ${r.name}`}
                            onClick={() => {
                              setEditingId(r.id);
                              setAdding(false);
                              setForm({ code: r.code, name: r.name, type: r.type, unit: r.unit, category: r.category ?? '', description: r.description ?? '' });
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => resourceAction(r, 'toggle')} className="rounded-md px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                            {r.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                          {!r._count?.components && (
                            <button type="button" aria-label={`Delete ${r.name}`} onClick={() => resourceAction(r, 'delete')} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {historyFor === r.id && (
                        <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/30">
                          <td colSpan={7} className="px-3 py-2 text-xs">
                            {history === null ? (
                              'Loading…'
                            ) : history.length === 0 ? (
                              <span className="text-slate-400">No price changes recorded in this region yet.</span>
                            ) : (
                              <ul className="space-y-0.5">
                                {history.map((h) => (
                                  <li key={h.id} className="text-slate-600 dark:text-slate-300">
                                    {new Date(h.createdAt).toLocaleDateString()} — {formatRate(h.previousRate)} → <strong>{formatRate(h.rate)}</strong>
                                    {h.changedBy && ` by ${h.changedBy.fullName}`}
                                    {h.source && <span className="text-slate-400"> · {h.source}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
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

        {changed.length > 0 && (
          <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/60">
            <span className="text-sm text-amber-900 dark:text-amber-200">
              {changed.length} price{changed.length === 1 ? '' : 's'} changed in {region?.name}
            </span>
            <input aria-label="Source of these prices" className={`${inputClass} h-8 min-w-[220px] flex-1`} placeholder="Source (optional), e.g. Dangote depot price list, Oct 2026" value={source} onChange={(e) => setSource(e.target.value)} />
            <button type="button" onClick={() => setEdits({})} className={secondaryButton}>
              Discard
            </button>
            <button type="button" disabled={busy} onClick={savePrices} className={primaryButton}>
              <Save size={14} />
              {busy ? 'Saving…' : 'Save prices'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
