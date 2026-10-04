'use client';

import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton } from '@/lib/stage0';
import { AdvicePanel } from './AdvicePanel';

const STRATEGIES = [
  { value: 'TRADITIONAL', label: 'Traditional (design–bid–build)' },
  { value: 'DESIGN_AND_BUILD', label: 'Design & build' },
  { value: 'MANAGEMENT_CONTRACTING', label: 'Management contracting' },
  { value: 'CONSTRUCTION_MANAGEMENT', label: 'Construction management' },
  { value: 'TURNKEY', label: 'Turnkey' },
  { value: 'OTHER', label: 'Other' },
];
const TENDER_METHODS = [
  { value: 'OPEN', label: 'Open tender' },
  { value: 'SELECTIVE', label: 'Selective (shortlist) tender' },
  { value: 'NEGOTIATED', label: 'Negotiated' },
  { value: 'NOMINATED', label: 'Nominated' },
];
const CONTRACT_FORMS = [
  { value: 'JBCC', label: 'JBCC' },
  { value: 'GCC', label: 'GCC' },
  { value: 'NEC', label: 'NEC' },
  { value: 'FIDIC', label: 'FIDIC' },
  { value: 'OTHER', label: 'Other' },
];

interface Policy {
  deliveryStrategy: string | null;
  tenderMethod: string | null;
  contractForm: string | null;
  minimumQuotes: number;
  priceWeight: number;
  ratingWeight: number;
  preferentialProcurement: string | null;
  localContentTargetPct: number | null;
  approvalThresholds: string | null;
  notes: string | null;
}

/** PROCSA DM 1.5 / PM 1.2 "Establish procurement policy" — consultants
 * advise on it (1.3). Its evaluation split is the default for every
 * consultant RFQ on this project. */
export function ProcurementPolicySection({ projectId, onChange }: { projectId: string; onChange?: () => void }) {
  const { authedFetch, user } = useAuth();
  // DM/PM establish the policy; everyone else advises on it below.
  const internal = !user || user.accountType === 'INTERNAL' || user.role === 'ADMIN';
  const [p, setP] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `/projects/${projectId}/inception/procurement-policy`;

  useEffect(() => {
    authedFetch<Policy>(url)
      .then(setP)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the policy.'));
  }, [authedFetch, url]);

  async function save() {
    if (!p) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setP(
        await authedFetch<Policy>(url, {
          method: 'PUT',
          body: {
            deliveryStrategy: p.deliveryStrategy || null,
            tenderMethod: p.tenderMethod || null,
            contractForm: p.contractForm || null,
            minimumQuotes: p.minimumQuotes,
            priceWeight: p.priceWeight,
            ratingWeight: 100 - p.priceWeight,
            preferentialProcurement: p.preferentialProcurement?.trim() || null,
            localContentTargetPct: p.localContentTargetPct,
            approvalThresholds: p.approvalThresholds?.trim() || null,
            notes: p.notes?.trim() || null,
          },
        }),
      );
      setSaved(true);
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the policy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Scale size={14} />
          Project procurement policy <span className="font-normal text-slate-400">· PROCSA DM 1.5 · PM 1.2</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">How consultants, contractors and suppliers will be procured on this project.</p>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {!p ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="pol-strategy">
                  Delivery strategy <span className="text-red-500">*</span>
                </label>
                <Select id="pol-strategy" value={p.deliveryStrategy ?? ''} onChange={(v) => setP({ ...p, deliveryStrategy: v })} className={inputClass} options={[{ value: '', label: '—' }, ...STRATEGIES]} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pol-tender">
                  Tender method <span className="text-red-500">*</span>
                </label>
                <Select id="pol-tender" value={p.tenderMethod ?? ''} onChange={(v) => setP({ ...p, tenderMethod: v })} className={inputClass} options={[{ value: '', label: '—' }, ...TENDER_METHODS]} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pol-form">
                  Contract form <span className="text-red-500">*</span>
                </label>
                <Select id="pol-form" value={p.contractForm ?? ''} onChange={(v) => setP({ ...p, contractForm: v })} className={inputClass} options={[{ value: '', label: '—' }, ...CONTRACT_FORMS]} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pol-min">
                  Minimum quotes per package
                </label>
                <input id="pol-min" type="number" min={1} max={20} className={inputClass} value={p.minimumQuotes} onChange={(e) => setP({ ...p, minimumQuotes: Number(e.target.value) || 1 })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pol-local">
                  Local content target (%)
                </label>
                <input
                  id="pol-local"
                  type="number"
                  min={0}
                  max={100}
                  className={inputClass}
                  value={p.localContentTargetPct ?? ''}
                  onChange={(e) => setP({ ...p, localContentTargetPct: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="pol-weight">
                  Bid evaluation: price {p.priceWeight}% · track record {100 - p.priceWeight}%
                </label>
                <input id="pol-weight" type="range" min={0} max={100} step={5} value={p.priceWeight} onChange={(e) => setP({ ...p, priceWeight: Number(e.target.value) })} className="mt-2 w-full accent-emerald-700" />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="pol-pref">
                Preferential procurement / empowerment targets
              </label>
              <textarea id="pol-pref" className={`${inputClass} h-16 resize-y py-2`} placeholder="e.g. 30% of subcontract value to EME/QSE; minimum B-BBEE level 4" value={p.preferentialProcurement ?? ''} onChange={(e) => setP({ ...p, preferentialProcurement: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pol-thresholds">
                Approval thresholds
              </label>
              <textarea id="pol-thresholds" className={`${inputClass} h-16 resize-y py-2`} placeholder="e.g. PM up to R500k; Development Manager up to R5m; client above" value={p.approvalThresholds ?? ''} onChange={(e) => setP({ ...p, approvalThresholds: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pol-notes">
                Notes
              </label>
              <textarea id="pol-notes" className={`${inputClass} h-16 resize-y py-2`} value={p.notes ?? ''} onChange={(e) => setP({ ...p, notes: e.target.value })} />
            </div>
            {internal ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className={primaryButton}>
                  {saving ? 'Saving…' : 'Save policy'}
                </button>
                {saved && <span className="text-xs text-emerald-700 dark:text-emerald-400">Saved — new consultant RFQs will use this evaluation split.</span>}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Setjeka sets the policy. Record your advice on it below.</p>
            )}
          </div>
        )}
      </div>
      <AdvicePanel projectId={projectId} topics={['PROCUREMENT_POLICY']} title="Consultants’ advice on the procurement policy (1.3)" />
    </div>
  );
}
