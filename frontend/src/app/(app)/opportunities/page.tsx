'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CURRENCY_OPTIONS } from '@/lib/projectMeta';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lightbulb, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { ClientPicker } from '@/components/clients/ClientPicker';
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_TONE,
  cardClass,
  formatMoney,
  inputClass,
  labelClass,
  primaryButton,
  type OpportunityStage,
  type Readiness,
} from '@/lib/stage0';

interface Opportunity {
  id: string;
  name: string;
  developmentType: string | null;
  location: string | null;
  client: { id: string; name: string } | null;
  estimatedValue: number | null;
  currency: string | null;
  stage: OpportunityStage;
  readiness: Readiness;
}

const EMPTY_FORM = { name: '', clientId: '', needAndDesirability: '', clientVision: '', developmentType: '', location: '', estimatedValue: '', currency: 'ZAR' };

export default function OpportunitiesPage() {
  const { authedFetch } = useAuth();
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    authedFetch<Opportunity[]>('/opportunities')
      .then(setOpportunities)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load opportunities.'));
  }, [authedFetch]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await authedFetch<Opportunity>('/opportunities', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          clientId: form.clientId || undefined,
          needAndDesirability: form.needAndDesirability.trim() || undefined,
          clientVision: form.clientVision.trim() || undefined,
          developmentType: form.developmentType.trim() || undefined,
          location: form.location.trim() || undefined,
          estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : undefined,
          currency: form.currency,
        },
      });
      router.push(`/opportunities/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create opportunity.');
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Opportunities</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            PROCSA Stage 0 — Initiation &amp; Briefing. Capture the client, source the site, appoint consultants, then hand over to Inception.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setForm(EMPTY_FORM);
          }}
          className="flex items-center gap-1.5 rounded-full bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
        >
          <Plus size={15} />
          New opportunity
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className={`${cardClass} mb-4 space-y-3`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="opp-name">
                Opportunity name <span className="text-red-500">*</span>
              </label>
              <input id="opp-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="opp-client">
                Client
              </label>
              <ClientPicker id="opp-client" value={form.clientId} onChange={(clientId) => setForm((f) => ({ ...f, clientId }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="opp-need">
                Need &amp; desirability (PROCSA 0.1)
              </label>
              <textarea
                id="opp-need"
                className={`${inputClass} h-20 resize-none py-2`}
                placeholder="Why this development is needed and wanted: demand, gap in the market, the client's driver"
                value={form.needAndDesirability}
                onChange={(e) => setForm({ ...form, needAndDesirability: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="opp-vision">
                Client&apos;s vision (PROCSA 0.3 — the client confirms it later in their portal)
              </label>
              <textarea
                id="opp-vision"
                className={`${inputClass} h-16 resize-none py-2`}
                placeholder="What the client wants this development to be"
                value={form.clientVision}
                onChange={(e) => setForm({ ...form, clientVision: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="opp-type">
                Development type
              </label>
              <input id="opp-type" className={inputClass} placeholder="e.g. Mixed-use, Residential" value={form.developmentType} onChange={(e) => setForm({ ...form, developmentType: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="opp-area">
                Target area
              </label>
              <input id="opp-area" className={inputClass} placeholder="Suburb / city — the exact site is chosen later" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="opp-value">
                Estimated value
              </label>
              <div className="flex gap-2">
                <input id="opp-value" type="number" min={0} className={`${inputClass} flex-1`} value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
                <div className="w-24">
                  <Select aria-label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={CURRENCY_OPTIONS} className={inputClass} />
                </div>
              </div>
            </div>
          </div>
          <button type="submit" disabled={saving || !form.name.trim()} className={primaryButton}>
            {saving ? 'Creating…' : 'Create opportunity'}
          </button>
        </form>
      )}

      {opportunities === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : opportunities.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Lightbulb size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No opportunities yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {opportunities.map((o) => {
              const done = o.readiness.done;
              return (
                <li key={o.id}>
                  <Link href={`/opportunities/${o.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                      <Lightbulb size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{o.name}</p>
                      <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                        {[o.client?.name ?? 'No client yet', o.developmentType, o.location].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    {o.stage !== 'CONVERTED' && (
                      <span className="hidden shrink-0 text-xs text-slate-400 sm:inline" title="PROCSA Stage 0, all roles">
                        Stage 0: {done}/{o.readiness.total}
                      </span>
                    )}
                    <span className="hidden shrink-0 text-xs text-slate-400 md:inline">{formatMoney(o.estimatedValue, o.currency)}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${OPPORTUNITY_STAGE_TONE[o.stage]}`}>
                      {OPPORTUNITY_STAGE_LABEL[o.stage]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
