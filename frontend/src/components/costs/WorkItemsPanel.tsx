'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, ChevronDown, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { TagInput } from '@/components/ui/TagInput';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import {
  RESOURCE_TYPE_LABEL,
  TAKEOFF_BASIS_LABEL,
  UNIT_SUGGESTIONS,
  costCodeLabel,
  formatQty,
  formatRate,
  type CostCode,
  type CostRegion,
  type CostResource,
  type TakeoffBasis,
  type WorkItem,
} from '@/lib/commercial';
import { SearchPicker } from './SearchPicker';

interface ComponentDraft {
  resourceId: string | null;
  quantity: string;
  wastePct: string;
}

const emptyItem = { code: '', name: '', unit: 'm²', description: '', costCodeId: '', takeoffBasis: '' as '' | TakeoffBasis, takeoffKeywords: [] as string[] };

/** Work items and their build-ups: what one unit of work consumes. A
 * 225 mm block wall per m² might be 10 blocks + 0.3 bags of cement + 0.04 m³
 * of sand + 0.9 h mason + 0.9 h labourer. Priced live in any region. */
export function WorkItemsPanel({ regions, regionId, onRegionChange, costCodes }: { regions: CostRegion[]; regionId: string; onRegionChange: (id: string) => void; costCodes: CostCode[] }) {
  const { authedFetch } = useAuth();
  const region = regions.find((r) => r.id === regionId) ?? null;
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [resources, setResources] = useState<CostResource[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(emptyItem);
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    const q = regionId ? `?all=true&regionId=${regionId}` : '?all=true';
    Promise.all([authedFetch<WorkItem[]>(`/work-items${q}`), authedFetch<CostResource[]>(`/cost-resources${q}`)])
      .then(([w, r]) => {
        setItems(w);
        setResources(r);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load work items.'));
  }, [authedFetch, regionId]);

  useEffect(() => {
    load();
  }, [load]);

  const resourceOptions = useMemo(
    () => resources.filter((r) => r.isActive).map((r) => ({ id: r.id, label: `${r.name} (${r.unit})`, hint: r.code })),
    [resources],
  );

  // Live preview, the same sum the server makes.
  const preview = useMemo(() => {
    let rate = 0;
    const missing: string[] = [];
    for (const c of components) {
      const r = resources.find((x) => x.id === c.resourceId);
      if (!r) continue;
      const q = Number(c.quantity) * (1 + (Number(c.wastePct) || 0) / 100);
      if (r.price) rate += q * r.price.rate;
      else missing.push(r.name);
    }
    return { rate, missing };
  }, [components, resources]);

  function startEdit(w: WorkItem | null) {
    setError(null);
    if (w) {
      setEditing(w.id);
      setForm({
        code: w.code,
        name: w.name,
        unit: w.unit,
        description: w.description ?? '',
        costCodeId: w.costCode?.id ?? '',
        takeoffBasis: w.takeoffBasis ?? '',
        takeoffKeywords: w.takeoffKeywords,
      });
      setComponents(w.components.map((c) => ({ resourceId: c.resource.id, quantity: String(c.quantity), wastePct: String(c.wastePct) })));
    } else {
      setEditing('new');
      setForm(emptyItem);
      setComponents([{ resourceId: null, quantity: '', wastePct: '0' }]);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const comps = components.filter((c) => c.resourceId && c.quantity !== '');
      const body = {
        code: form.code.trim(),
        name: form.name.trim(),
        unit: form.unit.trim(),
        description: form.description.trim() || (editing === 'new' ? undefined : null),
        costCodeId: form.costCodeId || (editing === 'new' ? undefined : null),
        takeoffBasis: form.takeoffBasis || (editing === 'new' ? undefined : null),
        takeoffKeywords: form.takeoffKeywords,
        components: comps.map((c) => ({ resourceId: c.resourceId, quantity: Number(c.quantity), wastePct: Number(c.wastePct) || 0 })),
      };
      if (editing === 'new') await authedFetch('/work-items', { method: 'POST', body });
      else await authedFetch(`/work-items/${editing}`, { method: 'PATCH', body });
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the work item.');
    } finally {
      setBusy(false);
    }
  }

  async function act(w: WorkItem, action: 'toggle' | 'delete') {
    setError(null);
    try {
      if (action === 'delete') {
        if (!confirm(`Delete ${w.name}?`)) return;
        await authedFetch(`/work-items/${w.id}`, { method: 'DELETE' });
      } else await authedFetch(`/work-items/${w.id}`, { method: 'PATCH', body: { isActive: !w.isActive } });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  const visible = (items ?? []).filter((w) => !query.trim() || `${w.code} ${w.name}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className={cardClass}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-72">
            <label className={labelClass} htmlFor="wi-region">
              Price in region
            </label>
            {regions.length ? (
              <Select id="wi-region" value={regionId} onChange={onRegionChange} options={regions.map((r) => ({ value: r.id, label: `${r.name} (${r.currency})` }))} className={inputClass} />
            ) : (
              <p className="text-sm text-slate-400">Add a region to see rates.</p>
            )}
          </div>
          <p className="flex-1 text-xs text-slate-500 dark:text-slate-400">
            A work item&apos;s rate is worked out from its build-up at the region&apos;s prices, so updating the price of cement updates every item that uses it.
          </p>
          {!editing && (
            <button type="button" onClick={() => startEdit(null)} className={secondaryButton}>
              <Plus size={14} />
              New work item
            </button>
          )}
        </div>

        {editing && (
          <form onSubmit={save} className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
              <div>
                <label className={labelClass} htmlFor="wi-code">
                  Code
                </label>
                <input id="wi-code" className={inputClass} placeholder="e.g. MAS-225" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label className={labelClass} htmlFor="wi-name">
                  Description of work
                </label>
                <input id="wi-name" className={inputClass} placeholder="e.g. 225 mm sandcrete block wall in cement mortar 1:6" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="wi-unit">
                  Unit
                </label>
                <input id="wi-unit" list="wi-units" className={inputClass} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                <datalist id="wi-units">
                  {UNIT_SUGGESTIONS.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelClass} htmlFor="wi-code-cc">
                  Cost code
                </label>
                <Select
                  id="wi-code-cc"
                  value={form.costCodeId}
                  onChange={(v) => setForm({ ...form, costCodeId: v })}
                  options={[{ value: '', label: '—' }, ...costCodes.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))]}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <p className={labelClass}>Build-up per {form.unit || 'unit'}</p>
              <div className="space-y-2">
                {components.map((c, i) => {
                  const r = resources.find((x) => x.id === c.resourceId);
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <SearchPicker
                        aria-label={`Resource ${i + 1}`}
                        className="min-w-[240px] flex-1"
                        options={resourceOptions}
                        value={c.resourceId}
                        placeholder="Search materials, labour, plant…"
                        onChange={(id) => setComponents(components.map((x, j) => (j === i ? { ...x, resourceId: id } : x)))}
                      />
                      <input
                        aria-label={`Quantity of resource ${i + 1}`}
                        type="number"
                        min={0}
                        step="any"
                        className={`${inputClass} w-28 text-right`}
                        placeholder="Qty"
                        value={c.quantity}
                        onChange={(e) => setComponents(components.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                      />
                      <span className="w-12 text-xs text-slate-500">{r?.unit ?? ''}</span>
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        + waste
                        <input
                          aria-label={`Waste % of resource ${i + 1}`}
                          type="number"
                          min={0}
                          step="any"
                          className={`${inputClass} w-16 text-right`}
                          value={c.wastePct}
                          onChange={(e) => setComponents(components.map((x, j) => (j === i ? { ...x, wastePct: e.target.value } : x)))}
                        />
                        %
                      </label>
                      <span className="w-28 text-right text-xs tabular-nums text-slate-500">
                        {r?.price && c.quantity ? formatRate(Number(c.quantity) * (1 + (Number(c.wastePct) || 0) / 100) * r.price.rate) : r && !r.price ? 'no price' : ''}
                      </span>
                      <button type="button" aria-label={`Remove resource ${i + 1}`} onClick={() => setComponents(components.filter((_, j) => j !== i))} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setComponents([...components, { resourceId: null, quantity: '', wastePct: '0' }])} className="mt-2 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                + Add a resource
              </button>
              {region && (
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                  Rate in {region.name}: <strong className="tabular-nums">{formatRate(preview.rate, region.currency)}</strong> per {form.unit || 'unit'}
                  {preview.missing.length > 0 && <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">({preview.missing.length} without a price here: {preview.missing.join(', ')})</span>}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="wi-basis">
                  Measured from a BIM/CAD model by
                </label>
                <Select
                  id="wi-basis"
                  value={form.takeoffBasis}
                  onChange={(v) => setForm({ ...form, takeoffBasis: v as '' | TakeoffBasis })}
                  options={[{ value: '', label: 'Not from models' }, ...(Object.keys(TAKEOFF_BASIS_LABEL) as TakeoffBasis[]).map((b) => ({ value: b, label: TAKEOFF_BASIS_LABEL[b] }))]}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <p className={labelClass}>Model keywords (suggest this item for matching model elements)</p>
                <TagInput values={form.takeoffKeywords} onChange={(v) => setForm({ ...form, takeoffKeywords: v })} suggestions={['wall', 'IfcWall', 'slab', 'IfcSlab', 'column', 'beam', 'roof', 'door', 'window', 'footing', 'floor', 'covering', 'stair']} placeholder="e.g. wall, IfcWall, 225" />
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={busy || !form.code.trim() || !form.name.trim() || !form.unit.trim()} className={primaryButton}>
                {busy ? 'Saving…' : 'Save work item'}
              </button>
              <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className={cardClass}>
        <div className="relative max-w-sm">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input aria-label="Search work items" className={`${inputClass} pl-8`} placeholder="Search work items" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {items === null ? (
          <p className="mt-4 text-sm text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No work items yet. Add your first build-up, e.g. a block wall per m² or concrete per m³.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="py-2 pr-2 font-medium">Code</th>
                  <th className="py-2 pr-2 font-medium">Work item</th>
                  <th className="py-2 pr-2 font-medium">Unit</th>
                  <th className="py-2 pr-2 font-medium">Cost code</th>
                  <th className="py-2 pr-2 text-right font-medium">Rate {region ? `(${region.currency})` : ''}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => (
                  <Fragment key={w.id}>
                    <tr className={`border-b border-slate-100 dark:border-slate-800 ${w.isActive ? '' : 'opacity-50'}`}>
                      <td className="py-2 pr-2 font-mono text-xs text-slate-500">{w.code}</td>
                      <td className="py-2 pr-2">
                        <button type="button" onClick={() => setOpen(open === w.id ? null : w.id)} className="flex items-center gap-1 text-left text-slate-800 hover:underline dark:text-slate-100">
                          <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${open === w.id ? '' : '-rotate-90'}`} />
                          {w.name}
                        </button>
                      </td>
                      <td className="py-2 pr-2 text-xs text-slate-500">{w.unit}</td>
                      <td className="py-2 pr-2 text-xs text-slate-500">{w.costCode ? w.costCode.code : '—'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {w.priced ? formatRate(w.priced.rate) : '—'}
                        {w.priced && w.priced.missing.length > 0 && (
                          <span title={`No price in this region for: ${w.priced.missing.join(', ')}`}>
                            <AlertTriangle size={12} className="ml-1 inline text-amber-500" />
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2 text-right">
                        <button type="button" aria-label={`Edit ${w.name}`} onClick={() => startEdit(w)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                          <Pencil size={13} />
                        </button>
                        <button type="button" onClick={() => act(w, 'toggle')} className="rounded-md px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                          {w.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button type="button" aria-label={`Delete ${w.name}`} onClick={() => act(w, 'delete')} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    {open === w.id && (
                      <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/30">
                        <td colSpan={6} className="px-3 py-2">
                          <p className="mb-1 text-xs text-slate-500">
                            Per 1 {w.unit} · {costCodeLabel(w.costCode)}
                            {w.takeoffBasis && ` · from models by ${TAKEOFF_BASIS_LABEL[w.takeoffBasis].toLowerCase()}`}
                            {w.takeoffKeywords.length > 0 && ` · keywords: ${w.takeoffKeywords.join(', ')}`}
                          </p>
                          <table className="w-full text-xs">
                            <tbody>
                              {(w.priced?.breakdown ?? w.components.map((c) => ({ resourceId: c.resource.id, name: c.resource.name, unit: c.resource.unit, type: c.resource.type, quantityPerUnit: c.quantity * (1 + c.wastePct / 100), price: null, amountPerUnit: 0 }))).map((b) => (
                                <tr key={b.resourceId}>
                                  <td className="py-0.5 pr-2 text-slate-700 dark:text-slate-200">{b.name}</td>
                                  <td className="py-0.5 pr-2 text-slate-400">{RESOURCE_TYPE_LABEL[b.type]}</td>
                                  <td className="py-0.5 pr-2 text-right tabular-nums">
                                    {formatQty(b.quantityPerUnit)} {b.unit}
                                  </td>
                                  <td className="py-0.5 pr-2 text-right tabular-nums text-slate-500">@ {b.price == null ? 'no price' : formatRate(b.price)}</td>
                                  <td className="py-0.5 text-right tabular-nums">{b.price == null ? '—' : formatRate(b.amountPerUnit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
