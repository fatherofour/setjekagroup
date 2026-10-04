'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, FileUp, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { TAKEOFF_BASIS_LABEL, formatQty, type TakeoffBasis, type WorkItem } from '@/lib/commercial';
import { SearchPicker } from '@/components/costs/SearchPicker';

interface Suggestion {
  id: string;
  code: string;
  name: string;
  unit: string;
  takeoffBasis: TakeoffBasis | null;
  alreadyAdded: boolean;
}

interface TakeoffItem {
  type: string;
  material: string;
  count: number;
  area_m2: number;
  volume_m3: number;
  length_m: number;
  ref: string;
  suggestedBasis: TakeoffBasis;
  suggestions: Suggestion[];
}

interface Takeoff {
  id: string;
  fileName: string;
  format: string;
  totalElements: number;
  createdAt: string;
  groups: { category: string; totals: { count: number; area_m2: number; volume_m3: number; length_m: number }; items: TakeoffItem[] }[];
}

interface TakeoffSummary {
  id: string;
  fileName: string;
  format: string;
  totalElements: number;
  createdAt: string;
  createdBy: { fullName: string };
}

interface RowChoice {
  include: boolean;
  workItemId: string | null;
  basis: TakeoffBasis;
  factor: string;
}

const QTY: Record<TakeoffBasis, keyof Pick<TakeoffItem, 'area_m2' | 'volume_m3' | 'length_m' | 'count'>> = { AREA: 'area_m2', VOLUME: 'volume_m3', LENGTH: 'length_m', COUNT: 'count' };
const BASIS_OPTIONS = (Object.keys(TAKEOFF_BASIS_LABEL) as TakeoffBasis[]).map((b) => ({ value: b, label: TAKEOFF_BASIS_LABEL[b] }));

/** Cost a BIM or CAD model: the converter measures every element group
 * (walls, slabs, columns…) and each group is priced as a work item, so the
 * build-ups multiply out into blocks, cement and labour automatically. */
export function ModelTakeoffPanel({ estimateId, takeoffs, readOnly, onChanged }: { estimateId: string; takeoffs: TakeoffSummary[]; readOnly: boolean; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ reachable: boolean; error: string | null } | null>(null);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [open, setOpen] = useState<Takeoff | null>(null);
  const [choices, setChoices] = useState<Record<string, RowChoice>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<{ reachable: boolean; error: string | null }>('/estimates/converter-status').then(setStatus).catch(() => setStatus({ reachable: false, error: 'Could not check the converter' }));
    authedFetch<WorkItem[]>('/work-items').then(setWorkItems).catch(() => {});
  }, [authedFetch]);

  const workItemOptions = useMemo(() => workItems.map((w) => ({ id: w.id, label: `${w.name} (${w.unit})`, hint: w.code })), [workItems]);

  function openTakeoff(t: Takeoff) {
    setOpen(t);
    const next: Record<string, RowChoice> = {};
    for (const g of t.groups) {
      for (const it of g.items) {
        const s = it.suggestions.find((x) => !x.alreadyAdded) ?? null;
        next[it.ref] = { include: Boolean(s), workItemId: s?.id ?? null, basis: s?.takeoffBasis ?? it.suggestedBasis, factor: '1' };
      }
    }
    setChoices(next);
  }

  async function load(id: string) {
    setError(null);
    try {
      openTakeoff(await authedFetch<Takeoff>(`/estimates/${estimateId}/takeoffs/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to open the takeoff.');
    }
  }

  async function upload(file: File) {
    setBusy('upload');
    setError(null);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const t = await authedFetch<Takeoff>(`/estimates/${estimateId}/takeoffs`, { method: 'POST', formData: fd });
      openTakeoff(t);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The model could not be read.');
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function apply() {
    if (!open) return;
    const rows = open.groups.flatMap((g) =>
      g.items
        .filter((it) => choices[it.ref]?.include && choices[it.ref].workItemId)
        .map((it) => ({ category: g.category, type: it.type, workItemId: choices[it.ref].workItemId!, basis: choices[it.ref].basis, factor: Number(choices[it.ref].factor) || 1 })),
    );
    if (!rows.length) return;
    setBusy('apply');
    setError(null);
    try {
      await authedFetch(`/estimates/${estimateId}/takeoffs/${open.id}/apply`, { method: 'POST', body: { rows } });
      setMessage(`${rows.length} line${rows.length === 1 ? '' : 's'} added to the estimate from ${open.fileName}.`);
      onChanged();
      await load(open.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the lines.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this takeoff? Lines already added stay on the estimate.')) return;
    try {
      await authedFetch(`/estimates/${estimateId}/takeoffs/${id}`, { method: 'DELETE' });
      if (open?.id === id) setOpen(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the takeoff.');
    }
  }

  const set = (ref: string, patch: Partial<RowChoice>) => setChoices((c) => ({ ...c, [ref]: { ...c[ref], ...patch } }));
  const selected = Object.values(choices).filter((c) => c.include && c.workItemId).length;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Box size={14} />
              Cost from a BIM or CAD model
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload an IFC, Revit (.rvt/.rfa), DWG, DGN or DXF file. The model is measured by element type (areas of walls, volumes of slabs and columns, counts of doors and windows). Match each type to a work item, and its build-up works out the materials and labour.
            </p>
            {status && !status.reachable && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{status.error}. Uploads will fail until it is started.</p>}
          </div>
          {!readOnly && (
            <>
              <input ref={fileRef} type="file" accept=".ifc,.rvt,.rfa,.dwg,.dgn,.dxf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} aria-label="Model file" />
              <button type="button" disabled={busy === 'upload'} onClick={() => fileRef.current?.click()} className={primaryButton}>
                <FileUp size={14} />
                {busy === 'upload' ? 'Reading the model…' : 'Upload a model'}
              </button>
            </>
          )}
        </div>
        {takeoffs.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {takeoffs.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <button type="button" onClick={() => load(t.id)} className={`font-medium hover:underline ${open?.id === t.id ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>
                  {t.fileName}
                </button>
                <span className="flex-1 text-xs text-slate-400">
                  {t.format.toUpperCase()} · {t.totalElements} elements · {t.createdBy.fullName} · {new Date(t.createdAt).toLocaleDateString()}
                </span>
                {!readOnly && (
                  <button type="button" aria-label={`Remove ${t.fileName}`} onClick={() => remove(t.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {open.fileName} — {open.totalElements} elements in {open.groups.length} categories
            </h3>
            {!readOnly && (
              <button type="button" disabled={!selected || busy === 'apply'} onClick={apply} className={primaryButton}>
                {busy === 'apply' ? 'Adding…' : `Add ${selected} line${selected === 1 ? '' : 's'} to the estimate`}
              </button>
            )}
          </div>
          {workItems.length === 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">There are no work items yet. Create build-ups in the Cost database, with model keywords, so they can be matched here.</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="w-8 py-2" />
                  <th className="py-2 pr-2 font-medium">Model element type</th>
                  <th className="py-2 pr-2 text-right font-medium">Count</th>
                  <th className="py-2 pr-2 text-right font-medium">Area m²</th>
                  <th className="py-2 pr-2 text-right font-medium">Volume m³</th>
                  <th className="py-2 pr-2 text-right font-medium">Length m</th>
                  <th className="w-72 py-2 pr-2 font-medium">Price as work item</th>
                  <th className="w-36 py-2 pr-2 font-medium">Measured by</th>
                  <th className="w-20 py-2 pr-2 font-medium">× factor</th>
                  <th className="py-2 text-right font-medium">Quantity</th>
                </tr>
              </thead>
              {open.groups.map((g) => (
                <tbody key={g.category}>
                  <tr className="bg-slate-50 dark:bg-slate-800/40">
                    <td colSpan={10} className="px-2 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {g.category}
                    </td>
                  </tr>
                  {g.items.map((it) => {
                    const c = choices[it.ref];
                    if (!c) return null;
                    const qty = (it[QTY[c.basis]] ?? 0) * (Number(c.factor) || 1);
                    const wi = workItems.find((w) => w.id === c.workItemId);
                    const added = it.suggestions.find((s) => s.id === c.workItemId)?.alreadyAdded;
                    const suggestedIds = new Set(it.suggestions.map((s) => s.id));
                    return (
                      <tr key={it.ref} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1.5">
                          <input type="checkbox" aria-label={`Include ${it.type}`} disabled={readOnly} checked={c.include} onChange={(e) => set(it.ref, { include: e.target.checked })} className="accent-emerald-600" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <span className="text-slate-800 dark:text-slate-100">{it.type}</span>
                          {it.material && <span className="ml-1 text-xs text-slate-400">{it.material}</span>}
                          {added && <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500 dark:bg-slate-800">already added</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{formatQty(it.count)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{formatQty(it.area_m2)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{formatQty(it.volume_m3)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{formatQty(it.length_m)}</td>
                        <td className="py-1.5 pr-2">
                          <SearchPicker
                            aria-label={`Work item for ${it.type}`}
                            options={[...workItemOptions.filter((o) => suggestedIds.has(o.id)).map((o) => ({ ...o, hint: `${o.hint} · suggested` })), ...workItemOptions.filter((o) => !suggestedIds.has(o.id))]}
                            value={c.workItemId}
                            placeholder="Choose a work item"
                            onChange={(id) => {
                              const w = workItems.find((x) => x.id === id);
                              set(it.ref, { workItemId: id, include: Boolean(id), basis: w?.takeoffBasis ?? c.basis });
                            }}
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Select aria-label={`Basis for ${it.type}`} value={c.basis} onChange={(v) => set(it.ref, { basis: v as TakeoffBasis })} options={BASIS_OPTIONS} className={`${inputClass} h-8`} />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input aria-label={`Factor for ${it.type}`} type="number" min={0} step="any" className={`${inputClass} h-8 text-right`} value={c.factor} onChange={(e) => set(it.ref, { factor: e.target.value })} />
                        </td>
                        <td className={`py-1.5 text-right tabular-nums ${qty > 0 ? 'text-slate-800 dark:text-slate-100' : 'text-red-600'}`}>
                          {formatQty(qty)} {wi?.unit ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tip: use the factor for things the model measures once but you price more than once, e.g. × 2 to plaster both faces of a wall from its side area.
          </p>
          {!readOnly && (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => setOpen(null)} className={secondaryButton}>
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
