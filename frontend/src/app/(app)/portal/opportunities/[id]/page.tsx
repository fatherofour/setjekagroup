'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Calculator, CheckCircle2, Flag, MapPin, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { APPOINTMENT_ROLE_LABEL, type OrganisationProjectRole } from '@/lib/organisationMeta';
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_TONE,
  SITE_STATUS_LABEL,
  SITE_STATUS_TONE,
  cardClass,
  formatMoney,
  primaryButton,
  type OpportunityStage,
  type SiteStatus,
} from '@/lib/stage0';

interface ClientOpportunity {
  id: string;
  name: string;
  description: string | null;
  needAndDesirability: string | null;
  clientVision: string | null;
  visionConfirmedAt: string | null;
  visionConfirmedBy: { fullName: string } | null;
  developmentType: string | null;
  location: string | null;
  estimatedValue: number | null;
  currency: string | null;
  stage: OpportunityStage;
  owner: { fullName: string; email: string } | null;
  convertedProject: { id: string; name: string; projectCode: string | null } | null;
  stageHistory: { id: string; previousStage: string; newStage: string; comment: string | null; changedAt: string }[];
  sites: { id: string; name: string; address: string | null; erfNumber: string | null; sizeSqm: number | null; zoning: string | null; status: SiteStatus; acquisitionStatus: string }[];
  approvals: { id: string; approvalType: string; category: string | null; status: string; dueDate: string | null }[];
  appointments: { id: string; role: OrganisationProjectRole; discipline: string | null; createdAt: string; contractor: { name: string } }[];
  businessCase: {
    name: string;
    revenueMode: 'SALE' | 'RENTAL';
    targetProfitPct: number;
    result: { totalDevelopmentCost: number; grossDevelopmentValue: number; profitOnCostPct: number | null; yieldOnCostPct: number | null; viable: boolean };
  } | null;
  milestones: { id: string; name: string; targetDate: string | null; actualDate: string | null; status: string }[];
}

const APPROVAL_STATUS: Record<string, string> = { PENDING: 'Not yet submitted', SUBMITTED: 'Submitted', APPROVED: 'Granted', REJECTED: 'Refused' };
const CATEGORY: Record<string, string> = { ZONING: 'Zoning', ENVIRONMENTAL: 'Environmental', INFRASTRUCTURE: 'Infrastructure', LEGAL: 'Legal', OTHER: 'Other' };
const MILESTONE_TONE: Record<string, string> = {
  COMPLETED: 'text-emerald-700 dark:text-emerald-400',
  COMPLETED_LATE: 'text-amber-700',
  OVERDUE: 'text-red-600',
  SLIPPED: 'text-amber-600',
  ON_TRACK: 'text-blue-600',
  NOT_SCHEDULED: 'text-slate-400',
};

export default function ClientPortalOpportunityPage() {
  const { id } = useParams<{ id: string }>();
  const { authedFetch } = useAuth();
  const [o, setO] = useState<ClientOpportunity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    authedFetch<ClientOpportunity>(`/client-portal/opportunities/${id}`)
      .then(setO)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load this development.'));
  }, [authedFetch, id]);

  async function confirmVision() {
    setBusy(true);
    setError(null);
    try {
      setO(await authedFetch<ClientOpportunity>(`/client-portal/opportunities/${id}/confirm-vision`, { method: 'POST' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to confirm.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !o) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!o) return <p className="text-sm text-slate-400">Loading…</p>;
  const bc = o.businessCase;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/portal/opportunities" className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400">
          <ArrowLeft size={14} />
          My developments
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{o.name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${OPPORTUNITY_STAGE_TONE[o.stage]}`}>{OPPORTUNITY_STAGE_LABEL[o.stage]}</span>
        </div>
        {o.owner && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Your Setjeka Development Manager: {o.owner.fullName} ({o.owner.email})
          </p>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {o.convertedProject && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          This development is now a live project:{' '}
          <Link href={`/projects/${o.convertedProject.id}`} className="font-medium underline">
            {o.convertedProject.name}
          </Link>
        </p>
      )}

      {o.clientVision && (
        <div className={`${cardClass} ${o.visionConfirmedAt ? '' : 'ring-2 ring-amber-400/60'}`}>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Sparkles size={14} />
            Your vision
          </h2>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{o.clientVision}</p>
          {o.visionConfirmedAt ? (
            <p className="mt-3 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 size={13} />
              Confirmed by {o.visionConfirmedBy?.fullName ?? 'you'} on {new Date(o.visionConfirmedAt).toLocaleDateString()}
            </p>
          ) : (
            !o.convertedProject && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" disabled={busy} onClick={confirmVision} className={primaryButton}>
                  {busy ? 'Confirming…' : 'Confirm this is our vision'}
                </button>
                <p className="text-xs text-slate-500">If it needs changing, tell your Development Manager — they&apos;ll update it for you to confirm.</p>
              </div>
            )
          )}
        </div>
      )}

      <div className={cardClass}>
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">The need</h2>
        <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{o.needAndDesirability || o.description || 'Being prepared.'}</p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-400">Development type</p>
            <p className="text-sm text-slate-800 dark:text-slate-100">{o.developmentType || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Area</p>
            <p className="text-sm text-slate-800 dark:text-slate-100">{o.location || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Estimated value</p>
            <p className="text-sm text-slate-800 dark:text-slate-100">{formatMoney(o.estimatedValue, o.currency)}</p>
          </div>
        </div>
      </div>

      {bc && (
        <div className={cardClass}>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Calculator size={14} />
            Business case — {bc.name}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">Total development cost</p>
              <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatMoney(bc.result.totalDevelopmentCost, o.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">{bc.revenueMode === 'RENTAL' ? 'Value of the completed asset' : 'Sales value'}</p>
              <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatMoney(bc.result.grossDevelopmentValue, o.currency)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Profit on cost</p>
              <p className={`text-sm font-semibold tabular-nums ${bc.result.viable ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600'}`}>
                {bc.result.profitOnCostPct?.toFixed(1)}% <span className="text-xs font-normal text-slate-400">(target {bc.targetProfitPct}%)</span>
              </p>
            </div>
            {bc.result.yieldOnCostPct !== null && (
              <div>
                <p className="text-xs text-slate-400">Yield on cost</p>
                <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{bc.result.yieldOnCostPct.toFixed(1)}%</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={cardClass}>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <MapPin size={14} />
          Sites
        </h2>
        {o.sites.length === 0 ? (
          <p className="text-sm text-slate-400">Sites are still being sourced.</p>
        ) : (
          <ul className="space-y-2">
            {o.sites.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                {s.status === 'SELECTED' && <CheckCircle2 size={15} className="text-emerald-600" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[s.address, s.erfNumber && `Erf ${s.erfNumber}`, s.sizeSqm != null && `${s.sizeSqm.toLocaleString()} m²`, s.zoning].filter(Boolean).join(' · ')}
                  </p>
                  {s.status === 'SELECTED' && s.acquisitionStatus !== 'NOT_STARTED' && (
                    <p className="text-xs text-slate-500">Acquisition: {s.acquisitionStatus.replace(/_/g, ' ').toLowerCase()}</p>
                  )}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SITE_STATUS_TONE[s.status]}`}>{SITE_STATUS_LABEL[s.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={cardClass}>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <ShieldCheck size={14} />
            Land rights &amp; approvals
          </h2>
          {o.approvals.length === 0 ? (
            <p className="text-sm text-slate-400">None tracked yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {o.approvals.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="text-slate-700 dark:text-slate-200">
                    {a.approvalType}
                    {a.category && <span className="ml-1 text-xs text-slate-400">· {CATEGORY[a.category]}</span>}
                  </span>
                  <span className="text-xs text-slate-500">{APPROVAL_STATUS[a.status] ?? a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={cardClass}>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <UserCheck size={14} />
            Indicative professional team
          </h2>
          {o.appointments.length === 0 ? (
            <p className="text-sm text-slate-400">Consultants are being procured.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {o.appointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-700 dark:text-slate-200">{a.contractor.name}</span>
                  <span className="text-xs text-slate-500">{a.discipline ?? APPOINTMENT_ROLE_LABEL[a.role]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {o.milestones.length > 0 && (
        <div className={cardClass}>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Flag size={14} />
            Milestones
          </h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {o.milestones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 text-slate-700 dark:text-slate-200">{m.name}</span>
                <span className={`text-xs ${MILESTONE_TONE[m.status] ?? 'text-slate-500'}`}>
                  {m.actualDate ? `Done ${new Date(m.actualDate).toLocaleDateString()}` : m.targetDate ? `Target ${new Date(m.targetDate).toLocaleDateString()}` : 'Not yet scheduled'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {o.stageHistory.length > 0 && (
        <div className={cardClass}>
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Progress</h2>
          <ul className="space-y-1.5">
            {o.stageHistory.map((h) => (
              <li key={h.id} className="text-xs text-slate-600 dark:text-slate-300">
                <span className="text-slate-400">{new Date(h.changedAt).toLocaleDateString()}</span> — {OPPORTUNITY_STAGE_LABEL[h.newStage as OpportunityStage] ?? h.newStage}
                {h.comment && <span className="text-slate-400"> · {h.comment}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
