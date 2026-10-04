'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Box, ChevronDown, Download, Lock, Trash2, Unlock, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import {
  RESOURCE_TYPE_LABEL,
  costCodeLabel,
  downloadCsv,
  formatQty,
  formatRate,
  type BreakdownEntry,
  type CostCode,
  type CostResource,
  type ResourceType,
  type WorkItem,
} from '@/lib/commercial';
import { SearchPicker } from '@/components/costs/SearchPicker';
import { ModelTakeoffPanel } from '@/components/estimates/ModelTakeoffPanel';

type LineKind = 'WORK_ITEM' | 'RESOURCE' | 'LUMP_SUM';

interface Line {
  id: string;
  kind: LineKind;
  description: string;
  unit: string | null;
  quantity: number;
  lumpSum: number | null;
  rateOverride: number | null;
  source: 'MANUAL' | 'MODEL';
  sourceRef: string | null;
  costCode: { id: string; code: string; name: string } | null;
  workItem: { id: string; code: string; name: string; unit: string } | null;
  resource: { id: string; code: string; name: string; unit: string } | null;
  breakdown: BreakdownEntry[];
  rate: number | null;
  amount: number;
  computedRate: number | null;
  overridden: boolean;
  missing: string[];
}

interface Estimate {
  id: string;
  reference: string;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'FINAL';
  currency: string;
  grossFloorArea: number | null;
  preliminariesPct: number;
  contingencyPct: number;
  overheadProfitPct: number;
  vatPct: number;
  finalisedAt: string | null;
  regionId: string;
  region: { id: string; name: string; currency: string };
  project: { id: string; name: string; currency: string } | null;
  opportunity: { id: string; name: string } | null;
  createdBy: { fullName: string };
  takeoffs: { id: string; fileName: string; format: string; totalElements: number; createdAt: string; createdBy: { fullName: string } }[];
  lines: Line[];
  summary: {
    worksTotal: number;
    preliminaries: number;
    overheadProfit: number;
    contingency: number;
    totalExclVat: number;
    vat: number;
    totalInclVat: number;
    costPerSqm: number | null;
    byCostCode: { costCodeId: string | null; code: string | null; name: string; amount: number }[];
    byType: Record<ResourceType | 'LUMP_SUM' | 'OVERRIDDEN', number>;
    missingPrices: string[];
  };
  schedule: { resourceId: string; code: string; name: string; unit: string; type: ResourceType; quantity: number; price: number | null; amount: number }[];
}

const TABS = [
  { value: 'boq', label: 'Bill of quantities' },
  { value: 'schedule', label: 'Material & labour schedule' },
  { value: 'model', label: 'Cost from model' },
  { value: 'settings', label: 'Settings' },
];

function AddLineForm({ estimate, codes, onAdded }: { estimate: Estimate; codes: CostCode[]; onAdded: (e: Estimate) => void }) {
  const { authedFetch } = useAuth();
  const [kind, setKind] = useState<LineKind>('WORK_ITEM');
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [resources, setResources] = useState<CostResource[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [lumpSum, setLumpSum] = useState('');
  const [description, setDescription] = useState('');
  const [costCodeId, setCostCodeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([authedFetch<WorkItem[]>(`/work-items?regionId=${estimate.regionId}`), authedFetch<CostResource[]>(`/cost-resources?regionId=${estimate.regionId}`)])
      .then(([w, r]) => {
        setWorkItems(w);
        setResources(r);
      })
      .catch(() => {});
  }, [authedFetch, estimate.regionId]);

  const wi = workItems.find((w) => w.id === pick);
  const res = resources.find((r) => r.id === pick);
  const unit = kind === 'WORK_ITEM' ? wi?.unit : kind === 'RESOURCE' ? res?.unit : null;
  const rate = kind === 'WORK_ITEM' ? wi?.priced?.rate : kind === 'RESOURCE' ? res?.price?.rate : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await authedFetch<Estimate>(`/estimates/${estimate.id}/lines`, {
        method: 'POST',
        body: {
          kind,
          workItemId: kind === 'WORK_ITEM' ? pick : undefined,
          resourceId: kind === 'RESOURCE' ? pick : undefined,
          quantity: kind === 'LUMP_SUM' ? undefined : Number(quantity),
          lumpSum: kind === 'LUMP_SUM' ? Number(lumpSum) : undefined,
          description: description.trim() || undefined,
          costCodeId: costCodeId || undefined,
        },
      });
      setPick(null);
      setQuantity('');
      setLumpSum('');
      setDescription('');
      onAdded(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the line.');
    } finally {
      setBusy(false);
    }
  }

  const ready = kind === 'LUMP_SUM' ? description.trim() && lumpSum !== '' : pick && quantity !== '' && Number(quantity) >= 0;

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-1">
        {(
          [
            ['WORK_ITEM', 'Work item'],
            ['RESOURCE', 'Single resource'],
            ['LUMP_SUM', 'Lump sum'],
          ] as [LineKind, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setPick(null);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${kind === k ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {kind === 'LUMP_SUM' ? (
          <>
            <div className="min-w-[240px] flex-1">
              <label className={labelClass} htmlFor="line-desc">
                Description
              </label>
              <input id="line-desc" className={inputClass} placeholder="e.g. Provisional sum for borehole" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="w-40">
              <label className={labelClass} htmlFor="line-lump">
                Amount ({estimate.currency})
              </label>
              <input id="line-lump" type="number" min={0} step="any" className={`${inputClass} text-right`} value={lumpSum} onChange={(e) => setLumpSum(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="min-w-[260px] flex-1">
              <label className={labelClass}>{kind === 'WORK_ITEM' ? 'Work item' : 'Resource'}</label>
              <SearchPicker
                aria-label={kind === 'WORK_ITEM' ? 'Work item' : 'Resource'}
                options={
                  kind === 'WORK_ITEM'
                    ? workItems.map((w) => ({ id: w.id, label: `${w.name} (${w.unit})`, hint: w.priced ? formatRate(w.priced.rate) : w.code }))
                    : resources.map((r) => ({ id: r.id, label: `${r.name} (${r.unit})`, hint: r.price ? formatRate(r.price.rate) : 'no price' }))
                }
                value={pick}
                onChange={(id) => {
                  setPick(id);
                  const w = workItems.find((x) => x.id === id);
                  if (w?.costCode) setCostCodeId(w.costCode.id);
                }}
                placeholder={kind === 'WORK_ITEM' ? 'Search work items…' : 'Search materials, labour, plant…'}
              />
            </div>
            <div className="w-32">
              <label className={labelClass} htmlFor="line-qty">
                Quantity {unit ? `(${unit})` : ''}
              </label>
              <input id="line-qty" type="number" min={0} step="any" className={`${inputClass} text-right`} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </>
        )}
        <div className="w-52">
          <label className={labelClass} htmlFor="line-cc">
            Cost code
          </label>
          <Select id="line-cc" value={costCodeId} onChange={setCostCodeId} options={[{ value: '', label: 'Not coded' }, ...codes.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))]} className={inputClass} />
        </div>
        <button type="submit" disabled={busy || !ready} className={primaryButton}>
          {busy ? 'Adding…' : 'Add line'}
        </button>
      </div>
      {kind !== 'LUMP_SUM' && pick && (
        <p className="text-xs text-slate-500">
          Rate in {estimate.region.name}: {rate != null ? formatRate(rate, estimate.currency) : 'not priced'} per {unit}
          {quantity && rate != null && ` · amount ${formatRate(rate * Number(quantity), estimate.currency)}`}
        </p>
      )}
    </form>
  );
}

function LineRow({ line, estimate, codes, readOnly, onChanged }: { line: Line; estimate: Estimate; codes: CostCode[]; readOnly: boolean; onChanged: (e: Estimate) => void }) {
  const { authedFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    try {
      onChanged(await authedFetch<Estimate>(`/estimates/${estimate.id}/lines/${line.id}`, { method: 'PATCH', body }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the line.');
    }
  }

  async function remove() {
    try {
      onChanged(await authedFetch<Estimate>(`/estimates/${estimate.id}/lines/${line.id}`, { method: 'DELETE' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the line.');
    }
  }

  return (
    <>
      <tr className="border-b border-slate-100 align-top dark:border-slate-800">
        <td className="py-1.5 pr-2">
          <button type="button" onClick={() => setOpen(!open)} disabled={!line.breakdown.length} className="flex items-start gap-1 text-left text-slate-800 disabled:cursor-default dark:text-slate-100">
            {line.breakdown.length > 0 && <ChevronDown size={13} className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`} />}
            <span>
              {line.description}
              {line.source === 'MODEL' && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-sky-50 px-1 text-[10px] text-sky-700 dark:bg-sky-950 dark:text-sky-300" title={line.sourceRef ?? ''}>
                  <Box size={9} />
                  model
                </span>
              )}
              {line.missing.length > 0 && !line.overridden && (
                <span title={`No price for: ${line.missing.join(', ')}`}>
                  <AlertTriangle size={12} className="ml-1 inline text-amber-500" />
                </span>
              )}
            </span>
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </td>
        <td className="w-40 py-1.5 pr-2">
          {readOnly ? (
            <span className="text-xs text-slate-500">{costCodeLabel(line.costCode)}</span>
          ) : (
            <Select aria-label="Cost code" value={line.costCode?.id ?? ''} onChange={(v) => patch({ costCodeId: v || null })} options={[{ value: '', label: 'Not coded' }, ...codes.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))]} className={`${inputClass} h-8 text-xs`} />
          )}
        </td>
        <td className="w-28 py-1.5 pr-2 text-right">
          {line.kind === 'LUMP_SUM' ? (
            <span className="text-xs text-slate-400">sum</span>
          ) : readOnly ? (
            <span className="tabular-nums">{formatQty(line.quantity)}</span>
          ) : (
            <input aria-label="Quantity" type="number" min={0} step="any" defaultValue={line.quantity} onBlur={(e) => Number(e.target.value) !== line.quantity && patch({ quantity: Number(e.target.value) })} className={`${inputClass} h-8 text-right tabular-nums`} />
          )}
        </td>
        <td className="w-12 py-1.5 pr-2 text-xs text-slate-500">{line.unit}</td>
        <td className="w-32 py-1.5 pr-2 text-right">
          {line.kind === 'LUMP_SUM' ? (
            readOnly ? (
              '—'
            ) : (
              <input aria-label="Lump sum" type="number" min={0} step="any" defaultValue={line.lumpSum ?? 0} onBlur={(e) => Number(e.target.value) !== line.lumpSum && patch({ lumpSum: Number(e.target.value) })} className={`${inputClass} h-8 text-right tabular-nums`} />
            )
          ) : readOnly ? (
            <span className="tabular-nums">{formatRate(line.rate)}</span>
          ) : (
            <input
              aria-label="Rate"
              type="number"
              min={0}
              step="any"
              defaultValue={line.rateOverride ?? ''}
              placeholder={line.computedRate != null ? line.computedRate.toFixed(2) : ''}
              title={line.overridden ? `Overridden; the build-up gives ${formatRate(line.computedRate)}` : 'From the build-up; type to override'}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value);
                if (v !== line.rateOverride) patch({ rateOverride: v });
              }}
              className={`${inputClass} h-8 text-right tabular-nums ${line.overridden ? 'border-amber-400' : ''}`}
            />
          )}
        </td>
        <td className="w-32 py-1.5 pr-2 text-right font-medium tabular-nums text-slate-800 dark:text-slate-100">{formatRate(line.amount)}</td>
        <td className="w-8 py-1.5 text-right">
          {!readOnly && (
            <button type="button" aria-label={`Remove ${line.description}`} onClick={remove} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/30">
          <td colSpan={7} className="px-6 py-2">
            <table className="w-full text-xs">
              <tbody>
                {line.breakdown.map((b) => (
                  <tr key={b.resourceId}>
                    <td className="py-0.5 pr-2 text-slate-700 dark:text-slate-200">{b.name}</td>
                    <td className="py-0.5 pr-2 text-slate-400">{RESOURCE_TYPE_LABEL[b.type]}</td>
                    <td className="py-0.5 pr-2 text-right tabular-nums">
                      {formatQty(b.quantityPerUnit)} {b.unit} per {line.unit}
                    </td>
                    <td className="py-0.5 pr-2 text-right tabular-nums font-medium">
                      = {formatQty(b.quantityPerUnit * line.quantity)} {b.unit}
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-slate-500">@ {b.price == null ? 'no price' : formatRate(b.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export default function EstimatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { authedFetch } = useAuth();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [codes, setCodes] = useState<CostCode[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string; currency: string }[]>([]);
  const [tab, setTab] = useState('boq');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    authedFetch<Estimate>(`/estimates/${id}`)
      .then((e) => {
        setEstimate(e);
        setSettings({
          name: e.name,
          description: e.description ?? '',
          regionId: e.regionId,
          grossFloorArea: e.grossFloorArea?.toString() ?? '',
          preliminariesPct: String(e.preliminariesPct),
          overheadProfitPct: String(e.overheadProfitPct),
          contingencyPct: String(e.contingencyPct),
          vatPct: String(e.vatPct),
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the estimate.'));
  }, [authedFetch, id]);

  useEffect(() => {
    load();
    authedFetch<CostCode[]>('/cost-codes').then(setCodes).catch(() => {});
    authedFetch<{ id: string; name: string; currency: string; isActive: boolean }[]>('/cost-regions')
      .then((r) => setRegions(r.filter((x) => x.isActive)))
      .catch(() => {});
  }, [load, authedFetch]);

  const grouped = useMemo(() => {
    if (!estimate) return [];
    const map = new Map<string, { label: string; code: string; lines: Line[]; total: number }>();
    for (const l of estimate.lines) {
      const key = l.costCode?.id ?? '__none__';
      if (!map.has(key)) map.set(key, { label: costCodeLabel(l.costCode), code: l.costCode?.code ?? 'zz', lines: [], total: 0 });
      const g = map.get(key)!;
      g.lines.push(l);
      g.total += l.amount;
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [estimate]);

  async function action(path: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(path);
    setError(null);
    setMessage(null);
    try {
      if (path === 'adopt-budget') {
        const r = await authedFetch<{ projectId: string; lines: number; contingency: number }>(`/estimates/${id}/adopt-budget`, { method: 'POST' });
        setMessage(`The project budget now has ${r.lines} cost-code lines and ${formatRate(r.contingency, estimate?.currency)} contingency from this estimate.`);
      } else {
        setEstimate(await authedFetch<Estimate>(`/estimates/${id}/${path}`, { method: 'POST' }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy('settings');
    setError(null);
    try {
      const num = (v: string) => (v === '' ? 0 : Number(v));
      const body: Record<string, unknown> = { name: settings.name.trim(), description: settings.description.trim() || null };
      if (estimate?.status === 'DRAFT') {
        Object.assign(body, {
          regionId: settings.regionId,
          grossFloorArea: settings.grossFloorArea === '' ? null : Number(settings.grossFloorArea),
          preliminariesPct: num(settings.preliminariesPct),
          overheadProfitPct: num(settings.overheadProfitPct),
          contingencyPct: num(settings.contingencyPct),
          vatPct: num(settings.vatPct),
        });
      }
      setEstimate(await authedFetch<Estimate>(`/estimates/${id}`, { method: 'PATCH', body }));
      setMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save settings.');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm('Delete this estimate?')) return;
    try {
      await authedFetch(`/estimates/${id}`, { method: 'DELETE' });
      router.push('/estimates');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete.');
    }
  }

  function exportCsv() {
    if (!estimate) return;
    const rows: (string | number | null)[][] = [['Cost code', 'Description', 'Quantity', 'Unit', `Rate (${estimate.currency})`, `Amount (${estimate.currency})`, 'Source']];
    for (const g of grouped) for (const l of g.lines) rows.push([g.label, l.description, l.kind === 'LUMP_SUM' ? '' : l.quantity, l.unit, l.rate, l.amount, l.source === 'MODEL' ? l.sourceRef : '']);
    const s = estimate.summary;
    rows.push([], ['', 'Works total', '', '', '', s.worksTotal], ['', `Preliminaries ${estimate.preliminariesPct}%`, '', '', '', s.preliminaries], ['', `Overheads & profit ${estimate.overheadProfitPct}%`, '', '', '', s.overheadProfit], ['', `Contingency ${estimate.contingencyPct}%`, '', '', '', s.contingency], ['', 'Total excl. VAT', '', '', '', s.totalExclVat], ['', `VAT ${estimate.vatPct}%`, '', '', '', s.vat], ['', 'Total incl. VAT', '', '', '', s.totalInclVat]);
    rows.push([], ['Material & labour schedule'], ['Code', 'Resource', 'Type', 'Quantity', 'Unit', `Price (${estimate.currency})`, `Amount (${estimate.currency})`]);
    for (const r of estimate.schedule) rows.push([r.code, r.name, RESOURCE_TYPE_LABEL[r.type], r.quantity, r.unit, r.price, r.amount]);
    downloadCsv(`${estimate.reference} ${estimate.name}.csv`, rows);
  }

  if (error && !estimate) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!estimate) return <p className="text-sm text-slate-400">Loading…</p>;

  const readOnly = estimate.status === 'FINAL';
  const s = estimate.summary;
  const cur = estimate.currency;
  const typeRows = (Object.entries(s.byType) as [string, number][]).filter(([, v]) => v);

  return (
    <div className="space-y-4">
      <Link href="/estimates" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        <ArrowLeft size={14} />
        Estimates
      </Link>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{estimate.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            <span className="font-mono text-xs">{estimate.reference}</span> · priced in {estimate.region.name} ({cur})
            {estimate.project && (
              <>
                {' · '}
                <Link href={`/projects/${estimate.project.id}?tab=commercial`} className="hover:underline">
                  {estimate.project.name}
                </Link>
              </>
            )}
            {estimate.opportunity && (
              <>
                {' · '}
                <Link href={`/opportunities/${estimate.opportunity.id}`} className="hover:underline">
                  {estimate.opportunity.name}
                </Link>
              </>
            )}
            {' · '}
            <span className={readOnly ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''}>{readOnly ? `Final ${estimate.finalisedAt ? new Date(estimate.finalisedAt).toLocaleDateString() : ''}` : 'Draft — prices are live'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className={secondaryButton}>
            <Download size={14} />
            Export CSV
          </button>
          {readOnly ? (
            <>
              {estimate.project && (
                <button type="button" disabled={busy === 'adopt-budget'} onClick={() => action('adopt-budget', `Replace ${estimate.project!.name}'s draft budget with this estimate?`)} className={primaryButton}>
                  <Wallet size={14} />
                  Adopt as project budget
                </button>
              )}
              <button type="button" disabled={busy === 'reopen'} onClick={() => action('reopen', 'Reopen? Rates will follow live prices again.')} className={secondaryButton}>
                <Unlock size={14} />
                Reopen
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy === 'finalise' || !estimate.lines.length} onClick={() => action('finalise', "Finalise? Every rate is frozen at today's prices.")} className={primaryButton}>
                <Lock size={14} />
                Finalise
              </button>
              <button type="button" onClick={remove} className={secondaryButton} aria-label="Delete estimate">
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>}
      {s.missingPrices.length > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            {s.missingPrices.length} resource{s.missingPrices.length === 1 ? ' has' : 's have'} no price in {estimate.region.name} and {s.missingPrices.length === 1 ? 'is' : 'are'} counted at zero: {s.missingPrices.join(', ')}.{' '}
            <Link href="/cost-database?tab=prices" className="font-medium underline">
              Price them
            </Link>
          </span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Works', s.worksTotal],
          ['Total excl. VAT', s.totalExclVat],
          ['Total incl. VAT', s.totalInclVat],
          ['Per m² (excl. VAT)', s.costPerSqm],
        ].map(([label, v]) => (
          <div key={label as string} className={cardClass}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">{v == null ? '—' : formatRate(v as number, cur)}</p>
          </div>
        ))}
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'boq' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className={`${cardClass} space-y-3`}>
            {!readOnly && <AddLineForm estimate={estimate} codes={codes} onAdded={setEstimate} />}
            {estimate.lines.length === 0 ? (
              <p className="text-sm text-slate-400">No lines yet. Add work items by hand, or measure them from a model on the &ldquo;Cost from model&rdquo; tab.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                      <th className="py-2 pr-2 font-medium">Description</th>
                      <th className="py-2 pr-2 font-medium">Cost code</th>
                      <th className="py-2 pr-2 text-right font-medium">Qty</th>
                      <th className="py-2 pr-2 font-medium">Unit</th>
                      <th className="py-2 pr-2 text-right font-medium">Rate</th>
                      <th className="py-2 pr-2 text-right font-medium">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  {grouped.map((g) => (
                    <tbody key={g.label}>
                      <tr className="bg-slate-50 dark:bg-slate-800/40">
                        <td colSpan={5} className="px-2 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {g.label}
                        </td>
                        <td className="py-1.5 pr-2 text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{formatRate(g.total)}</td>
                        <td />
                      </tr>
                      {g.lines.map((l) => (
                        <LineRow key={l.id} line={l} estimate={estimate} codes={codes} readOnly={readOnly} onChanged={setEstimate} />
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </div>

          <div className={`${cardClass} h-fit space-y-2 text-sm`}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Summary ({cur})</h2>
            {(
              [
                ['Works', s.worksTotal, false],
                [`Preliminaries ${estimate.preliminariesPct}%`, s.preliminaries, false],
                [`Overheads & profit ${estimate.overheadProfitPct}%`, s.overheadProfit, false],
                [`Contingency ${estimate.contingencyPct}%`, s.contingency, false],
                ['Total excl. VAT', s.totalExclVat, true],
                [`VAT ${estimate.vatPct}%`, s.vat, false],
                ['Total incl. VAT', s.totalInclVat, true],
              ] as [string, number, boolean][]
            ).map(([label, v, strong]) => (
              <div key={label} className={`flex justify-between gap-2 ${strong ? 'border-t border-slate-200 pt-2 font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>
                <span>{label}</span>
                <span className="tabular-nums">{formatRate(v)}</span>
              </div>
            ))}
            {typeRows.length > 0 && (
              <div className="border-t border-slate-200 pt-2 dark:border-slate-700">
                <p className="mb-1 text-xs font-medium text-slate-500">Works by type</p>
                {typeRows.map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>{k === 'LUMP_SUM' ? 'Lump sums' : k === 'OVERRIDDEN' ? 'Overridden rates' : RESOURCE_TYPE_LABEL[k as ResourceType]}</span>
                    <span className="tabular-nums">{formatRate(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'schedule' && (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Material &amp; labour schedule</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Every build-up multiplied out by its quantity, waste included: what to order and how many hours to plan for.</p>
          {estimate.schedule.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Nothing to schedule yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                    <th className="py-2 pr-2 font-medium">Resource</th>
                    <th className="py-2 pr-2 font-medium">Type</th>
                    <th className="py-2 pr-2 text-right font-medium">Quantity</th>
                    <th className="py-2 pr-2 font-medium">Unit</th>
                    <th className="py-2 pr-2 text-right font-medium">Price</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.schedule.map((r, i) => (
                    <Fragment key={r.resourceId}>
                      {(i === 0 || estimate.schedule[i - 1].type !== r.type) && (
                        <tr className="bg-slate-50 dark:bg-slate-800/40">
                          <td colSpan={6} className="px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {RESOURCE_TYPE_LABEL[r.type]}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-slate-100 dark:border-slate-800">
                        <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-100">{r.name}</td>
                        <td className="py-1.5 pr-2 text-xs text-slate-400">{r.code}</td>
                        <td className="py-1.5 pr-2 text-right font-medium tabular-nums">{formatQty(r.quantity)}</td>
                        <td className="py-1.5 pr-2 text-xs text-slate-500">{r.unit}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{r.price == null ? <span className="text-amber-600">no price</span> : formatRate(r.price)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatRate(r.amount)}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'model' && <ModelTakeoffPanel estimateId={estimate.id} takeoffs={estimate.takeoffs} readOnly={readOnly} onChanged={load} />}

      {tab === 'settings' && (
        <form onSubmit={saveSettings} className={`${cardClass} grid grid-cols-1 gap-3 sm:grid-cols-4`}>
          {readOnly && <p className="text-xs text-slate-500 sm:col-span-4">The estimate is final; only the name and notes can change. Reopen it to change the region or markups.</p>}
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="set-name">
              Name
            </label>
            <input id="set-name" className={inputClass} value={settings.name ?? ''} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="set-region">
              Region
            </label>
            <Select id="set-region" disabled={readOnly} value={settings.regionId ?? ''} onChange={(v) => setSettings({ ...settings, regionId: v })} options={regions.map((r) => ({ value: r.id, label: `${r.name} (${r.currency})` }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="set-gfa">
              Gross floor area (m²)
            </label>
            <input id="set-gfa" disabled={readOnly} type="number" min={0} step="any" className={inputClass} value={settings.grossFloorArea ?? ''} onChange={(e) => setSettings({ ...settings, grossFloorArea: e.target.value })} />
          </div>
          {(
            [
              ['preliminariesPct', 'Preliminaries % (of works)'],
              ['overheadProfitPct', 'Overheads & profit %'],
              ['contingencyPct', 'Contingency %'],
              ['vatPct', 'VAT %'],
            ] as [string, string][]
          ).map(([k, label]) => (
            <div key={k}>
              <label className={labelClass} htmlFor={`set-${k}`}>
                {label}
              </label>
              <input id={`set-${k}`} disabled={readOnly} type="number" min={0} max={100} step="any" className={inputClass} value={settings[k] ?? ''} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })} />
            </div>
          ))}
          <div className="sm:col-span-4">
            <label className={labelClass} htmlFor="set-desc">
              Notes / basis of estimate
            </label>
            <textarea id="set-desc" className={`${inputClass} h-20 resize-y py-2`} value={settings.description ?? ''} onChange={(e) => setSettings({ ...settings, description: e.target.value })} />
          </div>
          <div className="sm:col-span-4">
            <button type="submit" disabled={busy === 'settings'} className={primaryButton}>
              {busy === 'settings' ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
