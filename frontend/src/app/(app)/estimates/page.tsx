'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calculator, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { formatRate, type CostRegion } from '@/lib/commercial';

interface EstimateRow {
  id: string;
  reference: string;
  name: string;
  status: 'DRAFT' | 'FINAL';
  currency: string;
  grossFloorArea: number | null;
  lineCount: number;
  updatedAt: string;
  region: { name: string };
  project: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
  createdBy: { fullName: string };
  summary: { totalExclVat: number; totalInclVat: number; costPerSqm: number | null; missingPrices: string[] };
}

function Estimates() {
  const { authedFetch } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get('projectId') ?? '';
  const opportunityId = params.get('opportunityId') ?? '';
  const [rows, setRows] = useState<EstimateRow[] | null>(null);
  const [regions, setRegions] = useState<CostRegion[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [opportunities, setOpportunities] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', regionId: '', link: projectId ? `p:${projectId}` : opportunityId ? `o:${opportunityId}` : '', grossFloorArea: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = projectId ? `?projectId=${projectId}` : opportunityId ? `?opportunityId=${opportunityId}` : '';
    Promise.all([
      authedFetch<EstimateRow[]>(`/estimates${q}`),
      authedFetch<CostRegion[]>('/cost-regions'),
      authedFetch<{ id: string; name: string }[]>('/projects'),
      authedFetch<{ id: string; name: string; stage: string }[]>('/opportunities').catch(() => []),
    ])
      .then(([e, r, p, o]) => {
        setRows(e);
        const active = r.filter((x) => x.isActive);
        setRegions(active);
        setProjects(p);
        setOpportunities(o.filter((x) => x.stage !== 'CONVERTED'));
        setForm((f) => ({ ...f, regionId: f.regionId || active[0]?.id || '' }));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load estimates.'));
  }, [authedFetch, projectId, opportunityId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const [kind, id] = form.link.split(':');
      const created = await authedFetch<{ id: string }>('/estimates', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          regionId: form.regionId,
          projectId: kind === 'p' ? id : undefined,
          opportunityId: kind === 'o' ? id : undefined,
          grossFloorArea: form.grossFloorArea ? Number(form.grossFloorArea) : undefined,
        },
      });
      router.push(`/estimates/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create the estimate.');
      setBusy(false);
    }
  }

  const linkOptions = [
    { value: '', label: 'Standalone (not linked yet)' },
    ...projects.map((p) => ({ value: `p:${p.id}`, label: `Project — ${p.name}` })),
    ...opportunities.map((o) => ({ value: `o:${o.id}`, label: `Opportunity — ${o.name}` })),
  ];
  const scopeName = projectId ? projects.find((p) => p.id === projectId)?.name : opportunityId ? opportunities.find((o) => o.id === opportunityId)?.name : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Estimates{scopeName ? ` — ${scopeName}` : ''}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Rough cost estimates and bills of quantities, priced from a region&apos;s price sheet. Add work items by hand or measure them from a BIM or CAD model; the material schedule works out how many blocks, bags of cement and hours of labour the job needs.
          </p>
        </div>
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} disabled={!regions.length} className={primaryButton}>
            <Plus size={14} />
            New estimate
          </button>
        )}
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {rows !== null && !regions.length && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Add a pricing region and some prices in the <Link href="/cost-database?tab=regions" className="font-medium underline">Cost database</Link> before starting an estimate.
        </p>
      )}

      {creating && (
        <form onSubmit={create} className={`${cardClass} grid grid-cols-1 gap-3 sm:grid-cols-4`}>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="est-name">
              Estimate name
            </label>
            <input id="est-name" className={inputClass} placeholder="e.g. Lekki 12-unit block — rough cost" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="est-region">
              Priced in region
            </label>
            <Select id="est-region" value={form.regionId} onChange={(v) => setForm({ ...form, regionId: v })} options={regions.map((r) => ({ value: r.id, label: `${r.name} (${r.currency})` }))} className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="est-gfa">
              Gross floor area (m², optional)
            </label>
            <input id="est-gfa" type="number" min={0} step="any" className={inputClass} value={form.grossFloorArea} onChange={(e) => setForm({ ...form, grossFloorArea: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="est-link">
              For
            </label>
            <Select id="est-link" value={form.link} onChange={(v) => setForm({ ...form, link: v })} options={linkOptions} className={inputClass} />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button type="submit" disabled={busy || !form.name.trim() || !form.regionId} className={primaryButton}>
              {busy ? 'Creating…' : 'Create estimate'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className={`${cardClass} text-sm text-slate-400`}>No estimates yet.</div>
      ) : (
        <div className={`${cardClass} overflow-x-auto p-0`}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                <th className="px-4 py-2.5 font-medium">Estimate</th>
                <th className="px-2 py-2.5 font-medium">For</th>
                <th className="px-2 py-2.5 font-medium">Region</th>
                <th className="px-2 py-2.5 text-right font-medium">Total excl. VAT</th>
                <th className="px-2 py-2.5 text-right font-medium">Per m²</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/estimates/${r.id}`} className="flex items-center gap-2 font-medium text-slate-800 hover:underline dark:text-slate-100">
                      <Calculator size={14} className="text-emerald-600" />
                      {r.name}
                    </Link>
                    <span className="ml-6 font-mono text-[11px] text-slate-400">
                      {r.reference} · {r.lineCount} lines · {r.createdBy.fullName}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-slate-500">{r.project?.name ?? r.opportunity?.name ?? '—'}</td>
                  <td className="px-2 py-2.5 text-xs text-slate-500">{r.region.name}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatRate(r.summary.totalExclVat, r.currency)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-slate-500">{r.summary.costPerSqm != null ? formatRate(r.summary.costPerSqm) : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.status === 'FINAL' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {r.status === 'FINAL' ? 'Final' : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function EstimatesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
      <Estimates />
    </Suspense>
  );
}
