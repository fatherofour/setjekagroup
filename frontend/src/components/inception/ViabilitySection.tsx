'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Calculator, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, formatMoney, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { AdvicePanel } from './AdvicePanel';

interface Result {
  constructionCost: number;
  professionalFees: number;
  contingency: number;
  financeCost: number;
  totalDevelopmentCost: number;
  costPerSqm: number | null;
  netOperatingIncome: number | null;
  grossDevelopmentValue: number;
  profit: number;
  profitOnCostPct: number | null;
  profitOnValuePct: number | null;
  yieldOnCostPct: number | null;
  residualLandValue: number;
  viable: boolean;
}

interface Scenario {
  id: string;
  name: string;
  isPreferred: boolean;
  revenueMode: 'SALE' | 'RENTAL';
  assumptions: string | null;
  targetProfitPct: number;
  createdBy: { fullName: string };
  result: Result;
  [key: string]: unknown;
}

const NUMBER_FIELDS: { group: string; fields: { name: string; label: string; mode?: 'SALE' | 'RENTAL' }[] }[] = [
  {
    group: 'Costs',
    fields: [
      { name: 'landCost', label: 'Land cost' },
      { name: 'gbaSqm', label: 'Gross building area (m²)' },
      { name: 'constructionRatePerSqm', label: 'Construction rate per m²' },
      { name: 'professionalFeesPct', label: 'Professional fees (% of construction)' },
      { name: 'contingencyPct', label: 'Contingency (% of construction)' },
      { name: 'otherCosts', label: 'Other costs' },
      { name: 'financeRatePct', label: 'Finance rate (% p.a.)' },
      { name: 'financeMonths', label: 'Development period (months)' },
    ],
  },
  {
    group: 'Revenue',
    fields: [
      { name: 'sellableAreaSqm', label: 'Sellable area (m²)', mode: 'SALE' },
      { name: 'salePricePerSqm', label: 'Sale price per m²', mode: 'SALE' },
      { name: 'lettableAreaSqm', label: 'Lettable area (m²)', mode: 'RENTAL' },
      { name: 'rentPerSqmMonth', label: 'Rent per m² per month', mode: 'RENTAL' },
      { name: 'vacancyPct', label: 'Vacancy (%)', mode: 'RENTAL' },
      { name: 'capRatePct', label: 'Capitalisation rate (%)', mode: 'RENTAL' },
    ],
  },
  { group: 'Target', fields: [{ name: 'targetProfitPct', label: 'Target profit on cost (%)' }] },
];

const DEFAULTS: Record<string, string> = {
  professionalFeesPct: '12',
  contingencyPct: '5',
  financeRatePct: '11',
  financeMonths: '24',
  vacancyPct: '5',
  capRatePct: '9',
  targetProfitPct: '20',
};

const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${tone ?? 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
    </div>
  );
}

/** PROCSA DM 1.3 "Prepare a preliminary desk top project viability", with
 * the QS's economic factors (1.7) and everyone's financial design criteria
 * (QS 1.8, engineers 1.9) recorded alongside. */
export function ViabilitySection({
  projectId,
  basePath,
  title = 'Preliminary desktop viability',
  procsa = 'PROCSA DM 1.3',
  prefill,
  prefillNote,
  readOnly = false,
  currency,
  onChange,
}: {
  projectId?: string;
  // Opportunities use the same calculator for their first business case (0.2).
  basePath?: string;
  title?: string;
  procsa?: string;
  // Defaults for a new scenario, e.g. achievable rents from market research.
  prefill?: Record<string, string>;
  prefillNote?: string;
  readOnly?: boolean;
  currency: string;
  onChange?: () => void;
}) {
  const { authedFetch } = useAuth();
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = basePath ?? `/projects/${projectId}/inception/viability`;

  const load = () =>
    authedFetch<Scenario[]>(base)
      .then(setScenarios)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load scenarios.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  function open(s?: Scenario) {
    setEditing(s ? s.id : 'new');
    const values: Record<string, string> = {
      name: s?.name ?? (scenarios?.length ? `Scenario ${scenarios.length + 1}` : 'Base case'),
      revenueMode: s?.revenueMode ?? prefill?.revenueMode ?? 'SALE',
      assumptions: s?.assumptions ?? prefill?.assumptions ?? '',
    };
    for (const g of NUMBER_FIELDS) for (const f of g.fields) values[f.name] = s ? String(s[f.name] ?? '') : (prefill?.[f.name] ?? DEFAULTS[f.name] ?? '');
    setForm(values);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = { name: form.name.trim(), revenueMode: form.revenueMode, assumptions: form.assumptions.trim() || null };
    for (const g of NUMBER_FIELDS) for (const f of g.fields) if (form[f.name] !== '') body[f.name] = Number(form[f.name]);
    try {
      if (editing === 'new') await authedFetch(base, { method: 'POST', body });
      else await authedFetch(`${base}/${editing}`, { method: 'PATCH', body });
      setEditing(null);
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the scenario.');
    } finally {
      setSaving(false);
    }
  }

  async function prefer(id: string) {
    try {
      setScenarios(await authedFetch<Scenario[]>(`${base}/${id}/prefer`, { method: 'POST' }));
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to set the preferred scenario.');
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this scenario?')) return;
    try {
      await authedFetch(`${base}/${id}`, { method: 'DELETE' });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete the scenario.');
    }
  }

  const formBlock = (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="via-name">
            Scenario name
          </label>
          <input id="via-name" className={inputClass} value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <p className={labelClass}>Revenue</p>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(['SALE', 'RENTAL'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForm({ ...form, revenueMode: m })}
                className={`flex-1 rounded-md px-3 py-1 text-xs font-medium ${form.revenueMode === m ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500'}`}
              >
                {m === 'SALE' ? 'Develop to sell' : 'Develop to let'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {NUMBER_FIELDS.map((g) => (
        <div key={g.group}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.group}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.fields
              .filter((f) => !f.mode || f.mode === form.revenueMode)
              .map((f) => (
                <div key={f.name}>
                  <label className={labelClass} htmlFor={`via-${f.name}`}>
                    {f.label}
                  </label>
                  <input id={`via-${f.name}`} type="number" min={0} step="any" className={inputClass} value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                </div>
              ))}
          </div>
        </div>
      ))}
      <div>
        <label className={labelClass} htmlFor="via-assumptions">
          Assumptions
        </label>
        <textarea id="via-assumptions" className={`${inputClass} h-16 resize-y py-2`} value={form.assumptions ?? ''} onChange={(e) => setForm({ ...form, assumptions: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !form.name?.trim()} className={primaryButton}>
          {saving ? 'Calculating…' : 'Save & calculate'}
        </button>
        <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Calculator size={14} />
              {title} <span className="font-normal text-slate-400">· {procsa}</span>
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              A residual appraisal: fees and contingency as % of construction, finance on the land for the full period and on half the build spend, rental schemes valued at net income ÷ cap rate. Mark one scenario as preferred — that is the one that counts.
            </p>
            {prefillNote && editing === 'new' && <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{prefillNote}</p>}
          </div>
          {editing === null && !readOnly && (
            <button type="button" onClick={() => open()} className={secondaryButton}>
              <Plus size={14} />
              New scenario
            </button>
          )}
        </div>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {editing === 'new' && <div className="mt-3">{formBlock}</div>}
      </div>

      {scenarios === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : scenarios.length === 0 ? (
        editing !== 'new' && <p className="text-sm text-slate-400 dark:text-slate-500">No scenarios yet.</p>
      ) : (
        scenarios.map((s) =>
          editing === s.id ? (
            <div key={s.id}>{formBlock}</div>
          ) : (
            <div key={s.id} className={`${cardClass} ${s.isPreferred ? 'ring-2 ring-emerald-500/60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.name}</h3>
                <span className="text-xs text-slate-400">{s.revenueMode === 'SALE' ? 'Develop to sell' : 'Develop to let'}</span>
                {s.isPreferred && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Star size={10} /> Preferred
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    s.result.viable ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {s.result.viable ? `Meets ${s.targetProfitPct}% target` : `Below ${s.targetProfitPct}% target`}
                </span>
                <div className={`ml-auto flex items-center gap-1 ${readOnly ? 'hidden' : ''}`}>
                  {!s.isPreferred && (
                    <button type="button" onClick={() => prefer(s.id)} className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
                      Mark preferred
                    </button>
                  )}
                  <button type="button" aria-label="Edit scenario" onClick={() => open(s)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Pencil size={13} />
                  </button>
                  <button type="button" aria-label="Delete scenario" onClick={() => remove(s.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
                <Kpi label="Construction" value={formatMoney(s.result.constructionCost, currency)} />
                <Kpi label="Fees + contingency" value={formatMoney(s.result.professionalFees + s.result.contingency, currency)} />
                <Kpi label="Finance" value={formatMoney(s.result.financeCost, currency)} />
                <Kpi label="Total development cost" value={formatMoney(s.result.totalDevelopmentCost, currency)} />
                <Kpi label={s.revenueMode === 'RENTAL' ? 'Value (NOI ÷ cap rate)' : 'Gross development value'} value={formatMoney(s.result.grossDevelopmentValue, currency)} />
                <Kpi label="Profit" value={formatMoney(s.result.profit, currency)} tone={s.result.profit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'} />
                <Kpi label="Profit on cost" value={pct(s.result.profitOnCostPct)} tone={s.result.viable ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600'} />
                <Kpi label="Cost per m²" value={formatMoney(s.result.costPerSqm, currency)} />
                {s.result.yieldOnCostPct !== null && <Kpi label="Yield on cost" value={pct(s.result.yieldOnCostPct)} />}
                {s.result.netOperatingIncome !== null && <Kpi label="Net operating income p.a." value={formatMoney(s.result.netOperatingIncome, currency)} />}
                <Kpi label="Residual land value" value={formatMoney(s.result.residualLandValue, currency)} />
              </div>
              {s.assumptions && <p className="mt-3 whitespace-pre-line text-xs text-slate-500 dark:text-slate-400">Assumptions: {s.assumptions}</p>}
            </div>
          ),
        )
      )}

      {projectId && <AdvicePanel projectId={projectId} topics={['ECONOMIC_FACTORS', 'FINANCIAL_DESIGN_CRITERIA']} title="Economic factors & financial design criteria (QS 1.7–1.8, engineers 1.9)" />}
    </div>
  );
}
