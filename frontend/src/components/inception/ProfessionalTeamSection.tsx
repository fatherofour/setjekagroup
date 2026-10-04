'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Briefcase, CheckCircle2, CircleDashed, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { APPOINTMENT_ROLE_LABEL, type OrganisationProjectRole } from '@/lib/organisationMeta';
import { cardClass, formatMoney, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { memberLabel, type MemberRef } from '@/lib/inception';
import { ConsultantRfqForm } from '@/components/opportunities/ConsultantRfqForm';
import { ConsultantRfqCard } from '@/components/opportunities/ConsultantRfqCard';
import type { ConsultantRfq } from '@/components/opportunities/consultantTypes';
import { AdvicePanel } from './AdvicePanel';

interface Service {
  id: string;
  discipline: string;
  notes: string | null;
  notRequired: boolean;
  recommendedBy: MemberRef | null;
  coverage: 'APPOINTED' | 'INDICATIVE' | 'OPEN' | 'NOT_REQUIRED';
  appointedFirm: string | null;
}

interface Appointment {
  id: string;
  role: OrganisationProjectRole;
  appointmentType: string | null;
  appointmentReference: string | null;
  appointmentStatus: string;
  contractValue: number | null;
  currency: string | null;
  scopeOfWork: string | null;
  rolesAndResponsibilities: string | null;
  feeBasis: string | null;
  feePercentage: number | null;
  agreementForm: string | null;
  agreementStatus: 'NOT_STARTED' | 'DRAFTED' | 'ISSUED' | 'SIGNED';
  agreementSignedAt: string | null;
  rankAtAward: number | null;
  awardJustification: string | null;
  contractor: { id: string; name: string };
}

const AGREEMENT_LABEL = { NOT_STARTED: 'Not started', DRAFTED: 'Drafted', ISSUED: 'Issued for signature', SIGNED: 'Signed' } as const;
const AGREEMENT_TONE = {
  NOT_STARTED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  DRAFTED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  ISSUED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  SIGNED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
} as const;

const DISCIPLINES = ['Architect', 'Quantity Surveyor', 'Structural Engineer', 'Civil Engineer', 'Electrical Engineer', 'Mechanical Engineer', 'Fire Engineer', 'Health & Safety Agent', 'Land Surveyor', 'Town Planner', 'Environmental Consultant', 'Geotechnical Engineer', 'Landscape Architect'];

function TermsEditor({ projectId, appointment, onSaved }: { projectId: string; appointment: Appointment; onSaved: () => void }) {
  const { authedFetch } = useAuth();
  const [f, setF] = useState({
    scopeOfWork: appointment.scopeOfWork ?? '',
    rolesAndResponsibilities: appointment.rolesAndResponsibilities ?? '',
    feeBasis: appointment.feeBasis ?? '',
    feePercentage: appointment.feePercentage?.toString() ?? '',
    contractValue: appointment.contractValue?.toString() ?? '',
    agreementForm: appointment.agreementForm ?? '',
    agreementStatus: appointment.agreementStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/appointments/${appointment.id}`, {
        method: 'PATCH',
        body: {
          scopeOfWork: f.scopeOfWork.trim() || null,
          rolesAndResponsibilities: f.rolesAndResponsibilities.trim() || null,
          feeBasis: f.feeBasis.trim() || null,
          feePercentage: f.feePercentage === '' ? null : Number(f.feePercentage),
          contractValue: f.contractValue === '' ? null : Number(f.contractValue),
          agreementForm: f.agreementForm.trim() || null,
          agreementStatus: f.agreementStatus,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save terms.');
    } finally {
      setSaving(false);
    }
  }

  const id = (n: string) => `terms-${appointment.id}-${n}`;
  return (
    <form onSubmit={save} className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div>
        <label className={labelClass} htmlFor={id('scope')}>
          Scope of work and services (PM 1.5) <span className="text-red-500">*</span>
        </label>
        <textarea id={id('scope')} className={`${inputClass} h-20 resize-y py-2`} value={f.scopeOfWork} onChange={(e) => setF({ ...f, scopeOfWork: e.target.value })} />
      </div>
      <div>
        <label className={labelClass} htmlFor={id('roles')}>
          Roles and responsibilities (PM 1.3) <span className="text-red-500">*</span>
        </label>
        <textarea
          id={id('roles')}
          className={`${inputClass} h-20 resize-y py-2`}
          placeholder="e.g. Principal agent; lead design consultant; per PROCSA stages 1–6"
          value={f.rolesAndResponsibilities}
          onChange={(e) => setF({ ...f, rolesAndResponsibilities: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor={id('basis')}>
            Fee basis
          </label>
          <input id={id('basis')} list="fee-basis" className={inputClass} value={f.feeBasis} onChange={(e) => setF({ ...f, feeBasis: e.target.value })} />
          <datalist id="fee-basis">
            <option value="% of construction cost" />
            <option value="Lump sum" />
            <option value="Time-based" />
          </datalist>
        </div>
        <div>
          <label className={labelClass} htmlFor={id('pct')}>
            Fee %
          </label>
          <input id={id('pct')} type="number" min={0} max={100} step="any" className={inputClass} value={f.feePercentage} onChange={(e) => setF({ ...f, feePercentage: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor={id('value')}>
            Fee value ({appointment.currency ?? 'ZAR'})
          </label>
          <input id={id('value')} type="number" min={0} step="any" className={inputClass} value={f.contractValue} onChange={(e) => setF({ ...f, contractValue: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor={id('form')}>
            Agreement form
          </label>
          <input id={id('form')} className={inputClass} placeholder="e.g. PROCSA Client/Consultant Agreement" value={f.agreementForm} onChange={(e) => setF({ ...f, agreementForm: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className={labelClass} htmlFor={id('status')}>
            Agreement with the client (1.6)
          </label>
          <Select id={id('status')} value={f.agreementStatus} onChange={(v) => setF({ ...f, agreementStatus: v as Appointment['agreementStatus'] })} className={inputClass} options={Object.entries(AGREEMENT_LABEL).map(([value, label]) => ({ value, label }))} />
        </div>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? 'Saving…' : 'Save terms'}
        </button>
      </div>
    </form>
  );
}

/** PROCSA DM 1.4 / PM 1.3 "Appoint necessary consultants", PM 1.5 scope of
 * services, consultants' 1.5–1.6 scope and agreement with the client, and
 * the Architect 1.5 / QS 1.4 advice on which other consultants are needed. */
export function ProfessionalTeamSection({ projectId, projectName, onChange }: { projectId: string; projectName: string; onChange?: () => void }) {
  const { authedFetch, user } = useAuth();
  // Consultants see the team without other firms' fees (the API redacts
  // them), shape their own scope from My Stage 1, and never see the RFQs.
  const external = Boolean(user && user.accountType !== 'INTERNAL' && user.role !== 'ADMIN');
  const [team, setTeam] = useState<{ services: Service[]; appointments: Appointment[] } | null>(null);
  const [rfqs, setRfqs] = useState<ConsultantRfq[] | null>(null);
  const [policyWeight, setPolicyWeight] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [newService, setNewService] = useState({ discipline: '', notes: '' });
  const [addingService, setAddingService] = useState(false);
  const [creatingRfq, setCreatingRfq] = useState(false);
  const rfqBase = `/projects/${projectId}/consultant-rfqs`;

  const load = () =>
    Promise.all([
      authedFetch<{ services: Service[]; appointments: Appointment[] }>(`/projects/${projectId}/inception/professional-team`),
      external ? Promise.resolve(null) : authedFetch<ConsultantRfq[]>(rfqBase),
      external ? Promise.resolve(undefined) : authedFetch<{ priceWeight: number }>(`/projects/${projectId}/inception/procurement-policy`),
    ])
      .then(([t, r, p]) => {
        setTeam(t);
        setRfqs(r);
        setPolicyWeight(p?.priceWeight);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the professional team.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const refresh = () => {
    load();
    onChange?.();
  };

  async function addService(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/required-services`, {
        method: 'POST',
        body: { discipline: newService.discipline.trim(), notes: newService.notes.trim() || undefined },
      });
      setNewService({ discipline: '', notes: '' });
      setAddingService(false);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add the service.');
    }
  }

  async function indicativeAction(a: Appointment, action: 'confirm' | 'release') {
    if (action === 'release' && !confirm(`Release ${a.contractor.name}? The discipline can then be appointed from a consultant RFQ.`)) return;
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/appointments/${a.id}/${action}`, { method: 'POST' });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  async function serviceAction(s: Service, action: 'toggle' | 'delete') {
    setError(null);
    try {
      if (action === 'delete') await authedFetch(`/projects/${projectId}/inception/required-services/${s.id}`, { method: 'DELETE' });
      else await authedFetch(`/projects/${projectId}/inception/required-services/${s.id}`, { method: 'PATCH', body: { notRequired: !s.notRequired } });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the service.');
    }
  }

  if (error && !team) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!team) return <p className="text-sm text-slate-400">Loading…</p>;

  const open = team.services.filter((s) => s.coverage === 'OPEN').length;
  const indicative = team.services.filter((s) => s.coverage === 'INDICATIVE').length;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Users size={14} />
              Consultants and services required <span className="font-normal text-slate-400">· Architect 1.5 · QS 1.4</span>
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {open ? `${open} still to appoint. ` : ''}{indicative ? `${indicative} indicative from Stage 0, still to confirm. ` : ''}{!open && !indicative ? 'Every required service is covered.' : ''} A service counts as covered when a firm in that discipline is appointed.
            </p>
          </div>
          {!addingService && (
            <button type="button" onClick={() => setAddingService(true)} className={secondaryButton}>
              <Plus size={14} />
              Add service
            </button>
          )}
        </div>
        {addingService && (
          <form onSubmit={addService} className="mt-3 flex flex-wrap gap-2">
            <input aria-label="Discipline" list="service-disciplines" className={`${inputClass} w-56`} placeholder="Discipline" value={newService.discipline} onChange={(e) => setNewService({ ...newService, discipline: e.target.value })} />
            <datalist id="service-disciplines">
              {DISCIPLINES.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <input aria-label="Why it is needed" className={`${inputClass} min-w-[200px] flex-1`} placeholder="Why it is needed (optional)" value={newService.notes} onChange={(e) => setNewService({ ...newService, notes: e.target.value })} />
            <button type="submit" disabled={!newService.discipline.trim()} className={primaryButton}>
              Add
            </button>
            <button type="button" onClick={() => setAddingService(false)} className={secondaryButton}>
              Cancel
            </button>
          </form>
        )}
        {team.services.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No services listed yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {team.services.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                {s.coverage === 'APPOINTED' ? (
                  <CheckCircle2 size={15} className="text-emerald-600" />
                ) : (
                  <CircleDashed size={15} className={s.coverage === 'INDICATIVE' ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'} />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${s.notRequired ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{s.discipline}</p>
                  <p className="text-xs text-slate-400">
                    {[s.appointedFirm && `${s.coverage === 'INDICATIVE' ? 'Indicative (Stage 0)' : 'Appointed'}: ${s.appointedFirm}`, s.notes, s.recommendedBy && `Advised by ${memberLabel(s.recommendedBy)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" onClick={() => serviceAction(s, 'toggle')} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                  {s.notRequired ? 'Mark required' : 'Not required'}
                </button>
                {!external && (
                  <button type="button" aria-label={`Remove ${s.discipline}`} onClick={() => serviceAction(s, 'delete')} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={cardClass}>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Briefcase size={14} />
          Appointments, scopes and agreements <span className="font-normal text-slate-400">· DM 1.4 · PM 1.3 / 1.5 · consultants 1.5–1.6</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {external
            ? "Propose your own firm's scope and sign your agreement from My Stage 1. Fees are shown for your own appointment only."
            : 'Every appointment needs its scope of services and roles & responsibilities before the team can go to the client.'}
        </p>
        {team.appointments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">{external ? 'Nobody appointed yet.' : 'Nobody appointed yet — run a consultant RFQ below.'}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {team.appointments.filter((a) => a.appointmentStatus !== 'TERMINATED').map((a) => {
              const complete = Boolean(a.scopeOfWork?.trim() && a.rolesAndResponsibilities?.trim());
              const indicative = a.appointmentStatus === 'PROPOSED';
              return (
                <li key={a.id} className={`rounded-lg border p-3 ${indicative ? 'border-dashed border-amber-300 dark:border-amber-800' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.contractor.name}</span>
                    <span className="text-xs text-slate-500">{a.appointmentType ?? APPOINTMENT_ROLE_LABEL[a.role]}</span>
                    {a.appointmentReference && <span className="font-mono text-[11px] text-slate-400">{a.appointmentReference}</span>}
                    {a.rankAtAward != null && <span className="text-[11px] text-slate-400">ranked #{a.rankAtAward}</span>}
                    {indicative && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Indicative from Stage 0</span>}
                    <span className="ml-auto text-xs tabular-nums text-slate-500">{a.contractValue != null && formatMoney(a.contractValue, a.currency)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${AGREEMENT_TONE[a.agreementStatus]}`}>Agreement: {AGREEMENT_LABEL[a.agreementStatus]}</span>
                    {!external && (
                      <button type="button" aria-label={`Edit terms for ${a.contractor.name}`} onClick={() => setEditing(editing === a.id ? null : a.id)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  {!complete && editing !== a.id && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Scope of services or roles &amp; responsibilities still missing.</p>}
                  {complete && editing !== a.id && (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                      Scope: {a.scopeOfWork} · Responsibilities: {a.rolesAndResponsibilities}
                    </p>
                  )}
                  {a.awardJustification && <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Appointed over the recommendation: {a.awardJustification}</p>}
                  {indicative && !external && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-amber-50/60 px-3 py-2 dark:bg-amber-950/30">
                      <p className="flex-1 text-xs text-amber-900 dark:text-amber-200">Selected at Stage 0 as an indication only. Confirm the appointment to add the firm to the team, or release it and appoint another firm by RFQ.</p>
                      <button type="button" onClick={() => indicativeAction(a, 'confirm')} className={primaryButton}>
                        Confirm appointment
                      </button>
                      <button type="button" onClick={() => indicativeAction(a, 'release')} className={secondaryButton}>
                        Release
                      </button>
                    </div>
                  )}
                  {editing === a.id && (
                    <TermsEditor
                      projectId={projectId}
                      appointment={a}
                      onSaved={() => {
                        setEditing(null);
                        refresh();
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!external && (
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Consultant RFQs</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Choose a discipline, send one RFQ to every registered firm in it, and the system ranks the quotes on fee and track record using this project&apos;s procurement-policy split.
            </p>
          </div>
          {!creatingRfq && (
            <button type="button" onClick={() => setCreatingRfq(true)} className={secondaryButton}>
              <Plus size={14} />
              New RFQ
            </button>
          )}
        </div>
        {creatingRfq && (
          <div className="mt-3">
            <ConsultantRfqForm
              basePath={rfqBase}
              contextName={projectName}
              defaultPriceWeight={policyWeight}
              onCancel={() => setCreatingRfq(false)}
              onCreated={() => {
                setCreatingRfq(false);
                refresh();
              }}
            />
          </div>
        )}
        {rfqs && rfqs.length > 0 && (
          <div className="mt-3 space-y-2">
            {rfqs.map((r) => (
              <ConsultantRfqCard key={r.id} basePath={rfqBase} rfq={r} readOnly={false} onChange={refresh} />
            ))}
          </div>
        )}
        {rfqs && rfqs.length === 0 && !creatingRfq && <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No consultant RFQs on this project yet.</p>}
      </div>
      )}

      <AdvicePanel projectId={projectId} topics={['CONSULTANTS_REQUIRED']} title="Advice on other consultants and services required" />
    </div>
  );
}
