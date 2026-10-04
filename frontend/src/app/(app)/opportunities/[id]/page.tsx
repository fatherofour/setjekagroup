'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CommentThread } from '@/components/project/CommentThread';
import { ArrowLeft, Check, CheckCircle2, Clock, Pencil, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { ClientPicker } from '@/components/clients/ClientPicker';
import { PortalAccessPanel } from '@/components/portal/PortalAccessPanel';
import { OpportunitySitesPanel } from '@/components/opportunities/OpportunitySitesPanel';
import { OpportunityConsultantsPanel } from '@/components/opportunities/OpportunityConsultantsPanel';
import { Stage0Tracker } from '@/components/opportunities/Stage0Tracker';
import { InvestmentDecisionPanel } from '@/components/opportunities/InvestmentDecisionPanel';
import { LandRightsPanel } from '@/components/opportunities/LandRightsPanel';
import { PaymentsPanel } from '@/components/opportunities/PaymentsPanel';
import { MilestonesPanel } from '@/components/opportunities/MilestonesPanel';
import { EvidenceFiles } from '@/components/opportunities/EvidenceFiles';
import { ViabilitySection } from '@/components/inception/ViabilitySection';
import { RegisterPanel } from '@/components/inception/RegisterPanel';
import {
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_STAGE_TONE,
  cardClass,
  formatMoney,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  type ClientSummary,
  type OpportunityStage,
  type Readiness,
} from '@/lib/stage0';

interface Opportunity {
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
  client: (ClientSummary & { _count: { portalUsers: number } }) | null;
  owner: { id: string; fullName: string } | null;
  convertedProject: { id: string; name: string; projectCode: string | null } | null;
  sites: { id: string; name: string; status: string }[];
  approvals: { id: string }[];
  appointments: { id: string }[];
  marketResearch: { id: string; status: string }[];
  payments: { id: string; status: string }[];
  readiness: Readiness;
}

interface StageHistoryEntry {
  id: string;
  previousStage: string;
  newStage: string;
  comment: string | null;
  changedAt: string;
  changedBy: { fullName: string };
}

interface Research {
  id: string;
  status: string;
  achievableRentPerSqmMonth: number | null;
  achievableSalePricePerSqm: number | null;
  expectedVacancyPct: number | null;
  recommendedProduct: string | null;
  title: string;
}

// APPROVED is reached only through the Executive's investment decision.
const STAGE_OPTIONS: OpportunityStage[] = ['IDENTIFIED', 'UNDER_EVALUATION', 'ON_HOLD', 'REJECTED'];
const TABS = ['overview', 'client', 'business', 'research', 'sites', 'approvals', 'consultants', 'payments', 'milestones', 'documents'];

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-100">{value || '—'}</p>
    </div>
  );
}

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authedFetch } = useAuth();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [history, setHistory] = useState<StageHistoryEntry[] | null>(null);
  const [research, setResearch] = useState<Research[]>([]);
  const [contractors, setContractors] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(() => (TABS.includes(searchParams.get('tab') ?? '') ? searchParams.get('tab')! : 'overview'));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', needAndDesirability: '', developmentType: '', location: '', estimatedValue: '' });
  const [vision, setVision] = useState('');
  const [stageComment, setStageComment] = useState('');

  const load = useCallback(() => {
    authedFetch<Opportunity>(`/opportunities/${id}`)
      .then((o) => {
        setOpportunity(o);
        setVision(o.clientVision ?? '');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load opportunity.'));
    authedFetch<StageHistoryEntry[]>(`/opportunities/${id}/history`).then(setHistory).catch(() => {});
    authedFetch<Research[]>(`/opportunities/${id}/market-research`).then(setResearch).catch(() => {});
  }, [authedFetch, id]);

  useEffect(() => {
    load();
    authedFetch<{ id: string; name: string }[]>('/contractors').then(setContractors).catch(() => {});
  }, [load, authedFetch]);

  // Latest completed market research pre-fills a new business case (0.6 → 0.2).
  const prefill = useMemo(() => {
    const r = [...research].reverse().find((x) => x.status === 'COMPLETED');
    if (!r) return undefined;
    const p: Record<string, string> = {};
    if (r.achievableRentPerSqmMonth != null) {
      p.revenueMode = 'RENTAL';
      p.rentPerSqmMonth = String(r.achievableRentPerSqmMonth);
      if (r.expectedVacancyPct != null) p.vacancyPct = String(r.expectedVacancyPct);
    } else if (r.achievableSalePricePerSqm != null) {
      p.revenueMode = 'SALE';
      p.salePricePerSqm = String(r.achievableSalePricePerSqm);
    }
    p.assumptions = `Income from market research: ${r.title}${r.recommendedProduct ? ` — ${r.recommendedProduct}` : ''}`;
    return { values: p, note: `Pre-filled from “${r.title}”.` };
  }, [research]);

  const converted = opportunity?.stage === 'CONVERTED';

  async function patch(body: Record<string, unknown>, failure: string) {
    setSaving(true);
    setError(null);
    try {
      setOpportunity(await authedFetch<Opportunity>(`/opportunities/${id}`, { method: 'PATCH', body }));
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    if (!opportunity) return;
    setForm({
      name: opportunity.name,
      description: opportunity.description ?? '',
      needAndDesirability: opportunity.needAndDesirability ?? '',
      developmentType: opportunity.developmentType ?? '',
      location: opportunity.location ?? '',
      estimatedValue: opportunity.estimatedValue?.toString() ?? '',
    });
    setEditing(true);
  }

  async function saveDetails() {
    const ok = await patch(
      {
        name: form.name.trim(),
        description: form.description.trim() || null,
        needAndDesirability: form.needAndDesirability.trim() || null,
        developmentType: form.developmentType.trim() || null,
        location: form.location.trim() || null,
        estimatedValue: form.estimatedValue === '' ? null : Number(form.estimatedValue),
      },
      'Failed to save changes.',
    );
    if (ok) setEditing(false);
  }

  async function changeStage(stage: OpportunityStage) {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/opportunities/${id}/stage`, { method: 'PATCH', body: { stage, comment: stageComment.trim() || undefined } });
      setStageComment('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change stage.');
    } finally {
      setSaving(false);
    }
  }

  async function convertToProject() {
    if (!opportunity) return;
    if (
      !confirm(
        `Move "${opportunity.name}" into Inception?\n\nA project is created for ${opportunity.client?.name} at the selected site. The appointed consultants, client logins, business cases, land rights, paid consultant invoices and milestones carry across. This cannot be undone.`,
      )
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const updated = await authedFetch<Opportunity>(`/opportunities/${id}/convert-to-project`, { method: 'POST' });
      setOpportunity(updated);
      if (updated.convertedProject) router.push(`/projects/${updated.convertedProject.id}?tab=inception`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to move to Inception.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !opportunity) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!opportunity) return <p className="text-sm text-slate-400">Loading…</p>;
  const currency = opportunity.currency ?? 'ZAR';

  return (
    <div className="space-y-4">
      <div>
        <Link href="/opportunities" className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft size={14} />
          Back to opportunities
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{opportunity.name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${OPPORTUNITY_STAGE_TONE[opportunity.stage]}`}>{OPPORTUNITY_STAGE_LABEL[opportunity.stage]}</span>
        </div>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {opportunity.client ? (
            <Link href={`/clients/${opportunity.client.id}`} className="hover:underline">
              {opportunity.client.name}
            </Link>
          ) : (
            'No client yet'
          )}
          {opportunity.owner && ` · Development Manager: ${opportunity.owner.fullName}`}
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {opportunity.convertedProject && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          In Inception as project{' '}
          <Link href={`/projects/${opportunity.convertedProject.id}`} className="font-medium underline">
            {opportunity.convertedProject.name} ({opportunity.convertedProject.projectCode})
          </Link>
          . This Stage 0 record is kept read-only; milestones continue on the project.
        </p>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'client', label: 'Client & vision' },
          { value: 'business', label: 'Business case' },
          { value: 'research', label: 'Market research', count: opportunity.marketResearch.length },
          { value: 'sites', label: 'Sites & land', count: opportunity.sites.length },
          { value: 'approvals', label: 'Land rights', count: opportunity.approvals.length },
          { value: 'consultants', label: 'Consultants', count: opportunity.appointments.length },
          { value: 'payments', label: 'Payments', count: opportunity.payments.length },
          { value: 'milestones', label: 'Milestones' },
          { value: 'documents', label: 'Documents' },
        ]}
      />

      {tab === 'overview' && (
        <div className="space-y-4">
          <Stage0Tracker opportunityId={opportunity.id} readiness={opportunity.readiness} converted={converted} busy={saving} onGoTo={setTab} onConvert={convertToProject} onChanged={load} />
          {!converted && <InvestmentDecisionPanel opportunityId={opportunity.id} stage={opportunity.stage} onChanged={load} />}

          <div className={cardClass}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Need &amp; brief <span className="font-normal text-slate-400">· PROCSA 0.1</span>
              </h2>
              {!converted &&
                (editing ? (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400">
                      <X size={13} />
                      Cancel
                    </button>
                    <button onClick={saveDetails} disabled={saving || !form.name.trim()} className={primaryButton}>
                      <Check size={13} />
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <button onClick={startEdit} className={secondaryButton}>
                    <Pencil size={13} />
                    Edit
                  </button>
                ))}
            </div>
            {editing ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="ed-name">
                    Name
                  </label>
                  <input id="ed-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="ed-need">
                    Need &amp; desirability (0.1)
                  </label>
                  <textarea
                    id="ed-need"
                    className={`${inputClass} h-24 resize-y py-2`}
                    placeholder="Why this development is needed and wanted: demand, gap in the market, the client's driver"
                    value={form.needAndDesirability}
                    onChange={(e) => setForm({ ...form, needAndDesirability: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="ed-summary">
                    Summary
                  </label>
                  <textarea id="ed-summary" className={`${inputClass} h-16 resize-y py-2`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ed-type">
                    Development type
                  </label>
                  <input id="ed-type" className={inputClass} value={form.developmentType} onChange={(e) => setForm({ ...form, developmentType: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ed-area">
                    Target area
                  </label>
                  <input id="ed-area" className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ed-value">
                    Estimated value ({currency})
                  </label>
                  <input id="ed-value" type="number" min={0} className={inputClass} value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Need & desirability" value={opportunity.needAndDesirability} />
                </div>
                {opportunity.description && (
                  <div className="sm:col-span-2">
                    <Field label="Summary" value={opportunity.description} />
                  </div>
                )}
                <Field label="Development type" value={opportunity.developmentType} />
                <Field label="Target area" value={opportunity.location} />
                <Field label="Estimated value" value={opportunity.estimatedValue != null ? formatMoney(opportunity.estimatedValue, currency) : null} />
              </div>
            )}
          </div>

          <div className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Pipeline stage</h2>
            {!converted && (
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${inputClass} min-w-[200px] flex-1`} aria-label="Comment for this stage change" placeholder="Comment for this stage change (optional)" value={stageComment} onChange={(e) => setStageComment(e.target.value)} />
                <div className="w-56">
                  <Select
                    aria-label="Move to stage"
                    value=""
                    onChange={(v) => v && changeStage(v as OpportunityStage)}
                    className={inputClass}
                    options={[{ value: '', label: 'Move to stage…' }, ...STAGE_OPTIONS.filter((s) => s !== opportunity.stage).map((s) => ({ value: s, label: OPPORTUNITY_STAGE_LABEL[s] }))]}
                  />
                </div>
              </div>
            )}
            {!converted && <p className="mt-1 text-xs text-slate-400">Approval comes from the Executive’s investment decision above.</p>}
            {history && history.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                {history.map((h) => (
                  <li key={h.id} className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {OPPORTUNITY_STAGE_LABEL[h.previousStage as OpportunityStage] ?? h.previousStage} → {OPPORTUNITY_STAGE_LABEL[h.newStage as OpportunityStage] ?? h.newStage}
                    </span>
                    <span className="ml-2 text-slate-400">
                      by {h.changedBy.fullName} · {new Date(h.changedAt).toLocaleString()}
                    </span>
                    {h.comment && <p className="mt-0.5 text-slate-500 dark:text-slate-400">{h.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className={`${cardClass} mt-4`}>
          <CommentThread opportunityId={opportunity.id} entityType="OPPORTUNITY" entityId={opportunity.id} title="Notes & actions" />
        </div>
      )}

      {tab === 'client' && (
        <div className="space-y-4">
          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Client <span className="font-normal text-slate-400">· PROCSA 0.1 / 0.3</span>
            </h2>
            {!converted && (
              <div className="mt-3 max-w-md">
                <label className={labelClass} htmlFor="opp-client-pick">
                  {opportunity.client ? 'Change client' : 'Choose or add the client'}
                </label>
                <ClientPicker id="opp-client-pick" value={opportunity.client?.id ?? ''} onChange={(clientId) => patch({ clientId: clientId || null }, 'Failed to set client.')} />
              </div>
            )}
            {opportunity.client && (
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Company" value={opportunity.client.name} />
                <Field label="Contact" value={opportunity.client.contactName} />
                <Field label="Email" value={opportunity.client.email} />
              </div>
            )}
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Client&apos;s vision <span className="font-normal text-slate-400">· PROCSA 0.3 Formalise Client&apos;s Vision</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Write the vision up in the client&apos;s terms. It is formalised when the client confirms it in their portal; changing it afterwards asks them to confirm again.
            </p>
            <textarea
              aria-label="Client vision"
              disabled={converted}
              className={`${inputClass} mt-3 h-28 resize-y py-2`}
              placeholder="What the client wants this development to be and achieve"
              value={vision}
              onChange={(e) => setVision(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {!converted && (
                <button type="button" disabled={saving || vision.trim() === (opportunity.clientVision ?? '').trim()} onClick={() => patch({ clientVision: vision.trim() || null }, 'Failed to save the vision.')} className={primaryButton}>
                  Save vision
                </button>
              )}
              {opportunity.visionConfirmedAt ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 size={13} />
                  Confirmed by {opportunity.visionConfirmedBy?.fullName ?? 'the client'} on {new Date(opportunity.visionConfirmedAt).toLocaleDateString()}
                </span>
              ) : opportunity.clientVision ? (
                <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                  <Clock size={13} />
                  {opportunity.client?._count.portalUsers
                    ? 'Waiting for the client to confirm it in their portal'
                    : 'Give the client portal access below so they can confirm it'}
                </span>
              ) : null}
            </div>
          </div>

          {opportunity.client && (
            <PortalAccessPanel
              key={opportunity.client.id}
              basePath={`/clients/${opportunity.client.id}`}
              title="Client portal access"
              description="The client follows this opportunity read-only — need, vision, sites, land rights, business case headline, milestones and the appointed team, never fees or quotes — confirms the vision, and joins the project team at Inception."
              defaultName={opportunity.client.contactName}
              defaultEmail={opportunity.client.email}
            />
          )}
        </div>
      )}

      {tab === 'business' && (
        <ViabilitySection
          basePath={`/opportunities/${opportunity.id}/business-cases`}
          title="First business case"
          procsa="PROCSA 0.2"
          currency={currency}
          readOnly={converted}
          prefill={prefill?.values}
          prefillNote={prefill?.note}
          onChange={load}
        />
      )}
      {tab === 'business' && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="font-medium text-slate-900 dark:text-slate-100">Construction cost from the cost database</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Build a rough cost estimate priced from a region&apos;s price sheet, by hand or from a BIM/CAD model. Its cost per m² is a firmer construction rate for the scenarios above.
          </p>
          <Link href={`/estimates?opportunityId=${opportunity.id}`} className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Estimates for this opportunity →
          </Link>
        </div>
      )}

      {tab === 'research' && (
        <RegisterPanel
          register="market-research"
          basePath={`/opportunities/${opportunity.id}/market-research`}
          title="Market research"
          procsa="0.6"
          description="Research procured to confirm the right product and income stream. Completed research pre-fills the achievable rent or sale price in a new business case."
          addLabel="Add research"
          statusField="status"
          onChange={load}
          fields={[
            { name: 'title', label: 'Study', kind: 'text', required: true, wide: true },
            { name: 'providerId', label: 'Provider (registered firm)', kind: 'select', options: contractors.map((c) => ({ value: c.id, label: c.name })) },
            { name: 'providerName', label: 'Or provider name', kind: 'text' },
            {
              name: 'status',
              label: 'Status',
              kind: 'select',
              options: [
                { value: 'COMMISSIONED', label: 'Commissioned' },
                { value: 'IN_PROGRESS', label: 'In progress' },
                { value: 'COMPLETED', label: 'Completed' },
              ],
            },
            { name: 'completedAt', label: 'Completed on', kind: 'date' },
            { name: 'recommendedProduct', label: 'Recommended product', kind: 'text', wide: true, placeholder: 'e.g. A-grade offices, 25,000 m² GLA' },
            { name: 'targetMarket', label: 'Target market', kind: 'text' },
            { name: 'achievableRentPerSqmMonth', label: `Achievable rent (${currency}/m²/month)`, kind: 'number' },
            { name: 'achievableSalePricePerSqm', label: `Achievable sale price (${currency}/m²)`, kind: 'number' },
            { name: 'expectedVacancyPct', label: 'Expected vacancy (%)', kind: 'number' },
            { name: 'demandEvidence', label: 'Demand evidence', kind: 'textarea' },
            { name: 'findings', label: 'Findings', kind: 'textarea' },
          ]}
          renderRow={(row) => ({
            primary: <span className="font-medium">{String(row.title)}</span>,
            secondary: (
              <>
                {[
                  (row.provider as { name: string } | null)?.name ?? row.providerName,
                  row.recommendedProduct,
                  row.achievableRentPerSqmMonth != null && `${currency} ${row.achievableRentPerSqmMonth}/m²/month`,
                  row.achievableSalePricePerSqm != null && `${currency} ${Number(row.achievableSalePricePerSqm).toLocaleString()}/m²`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                <div className="mt-1">
                  <EvidenceFiles opportunityId={opportunity.id} linkType="MARKET_RESEARCH" linkId={row.id} readOnly={converted} compact />
                </div>
              </>
            ),
          })}
        />
      )}

      {tab === 'sites' && <OpportunitySitesPanel opportunityId={opportunity.id} readOnly={converted} onChange={load} />}
      {tab === 'approvals' && <LandRightsPanel opportunityId={opportunity.id} sites={opportunity.sites} readOnly={converted} onChange={load} />}
      {tab === 'consultants' && <OpportunityConsultantsPanel opportunityId={opportunity.id} opportunityName={opportunity.name} readOnly={converted || opportunity.stage === 'REJECTED'} onChange={load} />}
      {tab === 'payments' && <PaymentsPanel opportunityId={opportunity.id} currency={currency} onChange={load} />}
      {tab === 'milestones' &&
        (opportunity.convertedProject ? (
          <div className={cardClass}>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Milestones now continue on the project:{' '}
              <Link href={`/projects/${opportunity.convertedProject.id}?tab=inception`} className="font-medium text-emerald-700 underline dark:text-emerald-400">
                open the project&apos;s Inception tab → Development milestones
              </Link>
              .
            </p>
          </div>
        ) : (
          <MilestonesPanel basePath={`/opportunities/${opportunity.id}/milestones`} />
        ))}
      {tab === 'documents' && (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Stage 0 documents</h2>
          <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
            Everything on file for this opportunity — evidence attached to land rights, the site, research and payments, plus general documents attached here.
          </p>
          <EvidenceFiles opportunityId={opportunity.id} readOnly={converted} showLinks />
        </div>
      )}
    </div>
  );
}
