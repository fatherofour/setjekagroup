'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardCls, fmtDay, inputCls, labelCls, selectCls } from '@/lib/architect';
import { QUALITY_LABEL, RomPanel, money, type RomTable } from '@/components/estimates/RomPanel';

interface Named {
  id: string;
  name: string;
}

/** Rough estimates (Commercial): the calculator, saved against a project or
 * an opportunity, and the rate table Setjeka keeps. */
export default function RoughEstimatesPage() {
  const { authedFetch, user } = useAuth();
  const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
  const [projects, setProjects] = useState<Named[]>([]);
  const [opps, setOpps] = useState<Named[]>([]);
  const [scope, setScope] = useState('');
  const [table, setTable] = useState<RomTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!internal) return;
    authedFetch<Named[]>('/projects').then(setProjects).catch(() => setProjects([]));
    authedFetch<Named[] | { items: Named[] }>('/opportunities')
      .then((o) => setOpps(Array.isArray(o) ? o : o.items))
      .catch(() => setOpps([]));
    authedFetch<RomTable>('/rom/rates').then(setTable).catch(() => setTable(null));
  }, [authedFetch, internal]);

  // Critique L-12: say what the outside party can use instead.
  if (!internal)
    return (
      <p className="text-sm text-slate-500">
        Rough estimates are early budget checks that Setjeka&apos;s own team prepares before a project has a bill of quantities. The QS works from the project&apos;s Commercial screen: cost plans, bills of quantities and valuations.
      </p>
    );

  async function setRate(id: string, v: string) {
    const ratePerM2 = Number(v);
    if (!(ratePerM2 >= 100)) return;
    try {
      setTable(await authedFetch<RomTable>(`/rom/rates/${id}`, { method: 'PATCH', body: { ratePerM2 } }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the rate');
    }
  }
  async function setFactor(id: string, v: string) {
    const factor = Number(v);
    if (!(factor >= 0.5 && factor <= 2)) return;
    try {
      setTable(await authedFetch<RomTable>(`/rom/regions/${id}`, { method: 'PATCH', body: { factor } }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the factor');
    }
  }

  const [kind, id] = scope.split(':');
  const types = [...new Map((table?.rates ?? []).map((r) => [r.buildingType, r.label])).entries()];
  const rate = (t: string, q: string) => table?.rates.find((r) => r.buildingType === t && r.quality === q);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Rough estimates</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Order-of-magnitude costs for a development before it is designed.</p>
      </div>
      <RomPanel
        key={scope}
        projectId={kind === 'p' ? id : undefined}
        opportunityId={kind === 'o' ? id : undefined}
        scopePicker={
          <div className={`${labelCls} mt-3 max-w-md`}>
            Save against
            <Select
              className={`${selectCls} mt-0.5 w-full`}
              value={scope}
              onChange={setScope}
              options={[
                { value: '', label: 'Nothing - just work it out' },
                ...opps.map((o) => ({ value: `o:${o.id}`, label: `Opportunity: ${o.name}` })),
                ...projects.map((p) => ({ value: `p:${p.id}`, label: `Project: ${p.name}` })),
              ]}
              aria-label="Save against"
            />
          </div>
        }
      />

      <section className={`${cardCls} p-4`} aria-label="Rate table">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Rate table</h2>
        <p className="mt-0.5 text-xs text-slate-500">Rand per m² of gross floor area, excluding VAT, fees and land, for Gauteng; the provincial factors adjust it. Change a figure and click away to save it. Estimates already saved keep the rate they used.</p>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {table && (
          <div className="mt-3 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-3">Building type</th>
                    {table.qualities.map((q) => (
                      <th key={q} className="py-1.5 pr-3 text-right">
                        {QUALITY_LABEL[q] ?? q}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {types.map(([t, label]) => (
                    <tr key={t}>
                      <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{label}</td>
                      {table.qualities.map((q) => {
                        const r = rate(t, q);
                        return (
                          <td key={q} className="py-1 pr-3 text-right">
                            {r && (
                              <input
                                key={`${r.id}-${r.ratePerM2}`}
                                className={`${inputCls} h-8 w-28 text-right tabular-nums`}
                                defaultValue={r.ratePerM2}
                                inputMode="numeric"
                                aria-label={`${label}, ${QUALITY_LABEL[q]}`}
                                title={r.updatedBy ? `Last changed by ${r.updatedBy.fullName}, ${fmtDay(r.updatedAt)}` : `${money(r.ratePerM2)} per m²`}
                                onBlur={(e) => Number(e.target.value) !== r.ratePerM2 && setRate(r.id, e.target.value)}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1.5 pr-3">Province</th>
                  <th className="py-1.5 text-right">Factor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {table.regions.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-200">{r.region}</td>
                    <td className="py-1 text-right">
                      <input key={`${r.id}-${r.factor}`} className={`${inputCls} h-8 w-20 text-right tabular-nums`} defaultValue={r.factor} inputMode="decimal" aria-label={`${r.region} factor`} onBlur={(e) => Number(e.target.value) !== r.factor && setFactor(r.id, e.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
