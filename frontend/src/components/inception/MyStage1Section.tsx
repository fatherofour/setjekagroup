'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ChevronDown, Circle, PenLine } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, formatMoney, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { ADVICE_TOPICS, type AdviceTopic } from '@/lib/inception';
import { projectMemberRoleLabel, type ProjectMemberRole } from '@/lib/projectMemberRoles';

type Evidence =
  | { kind: 'advice'; topic: AdviceTopic; orConstraintRaised?: boolean; orInvestigationRecommended?: boolean; orServiceRecommended?: boolean; orCriterionRaised?: boolean }
  | { kind: 'deliverableReady' | 'deliverableApproved'; key: string }
  | { kind: Exclude<string, 'advice' | 'deliverableReady' | 'deliverableApproved'> };

interface Item {
  code: string;
  text: string;
  evidenceRule: Evidence;
  done: boolean;
  source: 'auto' | 'manual' | null;
  evidence: string | null;
  manualCheck: { doneBy: string; doneAt: string; note: string | null } | null;
}

interface Appointment {
  id: string;
  appointmentType: string | null;
  scopeOfWork: string | null;
  rolesAndResponsibilities: string | null;
  feeBasis: string | null;
  feePercentage: number | null;
  contractValue: number | null;
  currency: string | null;
  agreementForm: string | null;
  agreementStatus: 'NOT_STARTED' | 'DRAFTED' | 'ISSUED' | 'SIGNED';
  agreementSignedAt: string | null;
  contractor: { name: string };
}

interface MyRole {
  members: { id: string; role: ProjectMemberRole }[];
  roles: { key: string; label: string; items: Item[] }[];
  appointments: Appointment[];
  meetings: { id: string; title: string; meetingType: string; scheduledAt: string; status: string; attendees: { present: boolean | null }[] }[];
}

const SECTION_FOR_KEY: Record<string, string> = {
  BRIEF: 'brief',
  SITE_ASSESSMENT: 'site',
  DESKTOP_VIABILITY: 'viability',
  PROCUREMENT_POLICY: 'policy',
  CONSENTS_SCHEDULE: 'consents',
  PROFESSIONAL_TEAM: 'team',
  INITIATION_PROGRAMME: 'programme',
};

/** A small inline form that adds one row to a Stage 1 register. */
function QuickAdd({
  projectId,
  register,
  fields,
  submitLabel,
  onDone,
}: {
  projectId: string;
  register: string;
  fields: { name: string; label: string; placeholder?: string; type?: 'text' | 'number' | 'textarea'; required?: boolean; datalist?: string[] }[];
  submitLabel: string;
  onDone: () => void;
}) {
  const { authedFetch } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of fields) if ((values[f.name] ?? '').trim()) body[f.name] = f.type === 'number' ? Number(values[f.name]) : values[f.name].trim();
      await authedFetch(`/projects/${projectId}/inception/${register}`, { method: 'POST', body });
      setValues({});
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `qa-${register}-${f.name}`;
          return (
            <div key={f.name} className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}>
              <label className={labelClass} htmlFor={id}>
                {f.label}
              </label>
              {f.type === 'textarea' ? (
                <textarea id={id} className={`${inputClass} h-16 resize-y py-2`} placeholder={f.placeholder} value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
              ) : (
                <>
                  <input
                    id={id}
                    type={f.type === 'number' ? 'number' : 'text'}
                    step="any"
                    list={f.datalist ? `${id}-list` : undefined}
                    className={inputClass}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  />
                  {f.datalist && (
                    <datalist id={`${id}-list`}>
                      {f.datalist.map((d) => (
                        <option key={d} value={d} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <button type="submit" disabled={busy || fields.some((f) => f.required && !(values[f.name] ?? '').trim())} className={primaryButton}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function AdviceQuick({ projectId, topic, onDone }: { projectId: string; topic: AdviceTopic; onDone: () => void }) {
  const { authedFetch } = useAuth();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/advice`, { method: 'POST', body: { topic, body: body.trim() } });
      setBody('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save advice.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <label className={labelClass} htmlFor={`adv-${topic}`}>
        Your advice on {ADVICE_TOPICS[topic].toLowerCase()}
      </label>
      <textarea id={`adv-${topic}`} className={`${inputClass} h-20 resize-y py-2`} value={body} onChange={(e) => setBody(e.target.value)} />
      <button type="submit" disabled={busy || !body.trim()} className={primaryButton}>
        {busy ? 'Saving…' : 'Record advice'}
      </button>
    </form>
  );
}

function BriefInput({ projectId, onDone, onOpenBrief }: { projectId: string; onDone: () => void; onOpenBrief: () => void }) {
  const { authedFetch } = useAuth();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/comments`, { method: 'POST', body: { entityType: 'PROJECT_BRIEF', entityId: projectId, body: body.trim() } });
      setBody('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <label className={labelClass} htmlFor="brief-input">
        Your input on the brief
      </label>
      <textarea id="brief-input" className={`${inputClass} h-20 resize-y py-2`} placeholder="Requirements, risks or options the brief should cover from your discipline" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !body.trim()} className={primaryButton}>
          {busy ? 'Posting…' : 'Post to the brief'}
        </button>
        <button type="button" onClick={onOpenBrief} className={secondaryButton}>
          Read the brief
        </button>
      </div>
    </form>
  );
}

function MyAppointmentScope({ projectId, appointment, onDone }: { projectId: string; appointment: Appointment; onDone: () => void }) {
  const { authedFetch } = useAuth();
  const [scope, setScope] = useState(appointment.scopeOfWork ?? '');
  const [roles, setRoles] = useState(appointment.rolesAndResponsibilities ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = appointment.agreementStatus === 'SIGNED';
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/my-appointments/${appointment.id}`, {
        method: 'PATCH',
        body: { scopeOfWork: scope.trim() || null, rolesAndResponsibilities: roles.trim() || null },
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div>
        <label className={labelClass} htmlFor={`my-scope-${appointment.id}`}>
          Scope of work and services — {appointment.contractor.name}
        </label>
        <textarea id={`my-scope-${appointment.id}`} disabled={locked} className={`${inputClass} h-20 resize-y py-2`} value={scope} onChange={(e) => setScope(e.target.value)} />
      </div>
      <div>
        <label className={labelClass} htmlFor={`my-roles-${appointment.id}`}>
          Roles and responsibilities
        </label>
        <textarea id={`my-roles-${appointment.id}`} disabled={locked} className={`${inputClass} h-16 resize-y py-2`} value={roles} onChange={(e) => setRoles(e.target.value)} />
      </div>
      {locked ? (
        <p className="text-xs text-slate-500">The agreement is signed, so the scope is fixed. Ask the Project Manager for any change.</p>
      ) : (
        <button type="button" disabled={busy} onClick={save} className={primaryButton}>
          {busy ? 'Saving…' : 'Save scope'}
        </button>
      )}
    </div>
  );
}

function MyAgreement({ projectId, appointment, onDone }: { projectId: string; appointment: Appointment; onDone: () => void }) {
  const { authedFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function sign() {
    if (!confirm(`Sign the agreement for ${appointment.contractor.name}? This accepts the scope and fee terms shown.`)) return;
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/my-appointments/${appointment.id}/sign`, { method: 'POST' });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to sign.');
    } finally {
      setBusy(false);
    }
  }
  const terms = [
    appointment.agreementForm,
    appointment.feeBasis,
    appointment.feePercentage != null && `${appointment.feePercentage}%`,
    appointment.contractValue != null && formatMoney(appointment.contractValue, appointment.currency),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="space-y-2 text-sm">
      {error && <p className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <p className="text-slate-700 dark:text-slate-200">
        {appointment.contractor.name}: {terms || 'terms being prepared by Setjeka'}
      </p>
      {appointment.agreementStatus === 'SIGNED' ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">Signed {appointment.agreementSignedAt && new Date(appointment.agreementSignedAt).toLocaleDateString()}</p>
      ) : appointment.agreementStatus === 'ISSUED' ? (
        <button type="button" disabled={busy} onClick={sign} className={primaryButton}>
          <PenLine size={13} />
          {busy ? 'Signing…' : 'Accept and sign the agreement'}
        </button>
      ) : (
        <p className="text-xs text-slate-500">Setjeka hasn&apos;t issued the agreement for signature yet ({appointment.agreementStatus === 'DRAFTED' ? 'drafted' : 'not started'}).</p>
      )}
    </div>
  );
}

const CONSTRAINT_FIELDS = [
  { name: 'category', label: 'Category', required: true, datalist: ['Zoning & land use', 'Servitude', 'Title / legal', 'Geotechnical', 'Topography', 'Bulk services', 'Access & traffic', 'Environmental', 'Heritage'] },
  { name: 'description', label: 'Right, constraint or consent', type: 'textarea' as const, required: true },
];
const INVESTIGATION_FIELDS = [
  {
    name: 'investigationType',
    label: 'Survey / investigation',
    required: true,
    datalist: ['Topographical survey', 'Geotechnical investigation', 'Bulk services capacity study', 'Electrical supply capacity', 'Traffic impact assessment', 'Environmental impact assessment', 'Existing building condition survey'],
  },
  { name: 'estimatedCost', label: 'Estimated cost', type: 'number' as const },
  { name: 'description', label: 'Why it is needed for Stage 2 (incl. infrastructure & services)', type: 'textarea' as const },
];
const SERVICE_FIELDS = [
  {
    name: 'discipline',
    label: 'Consultant / service needed',
    required: true,
    datalist: ['Fire Engineer', 'Health & Safety Agent', 'Land Surveyor', 'Town Planner', 'Geotechnical Engineer', 'Wet Services Engineer', 'Acoustic Engineer', 'Landscape Architect'],
  },
  { name: 'notes', label: 'Why', type: 'textarea' as const },
];
const CRITERION_FIELDS = [
  { name: 'category', label: 'Criterion', required: true, datalist: ['Building cost limit', 'Services allowance', 'Structural cost allowance', 'Escalation', 'Life-cycle cost', 'Energy / running cost', 'Contingency'] },
  { name: 'value', label: 'Value', type: 'number' as const },
  { name: 'unit', label: 'Unit', placeholder: 'e.g. R/m², % of construction, % p.a.' },
  { name: 'description', label: 'Explanation', type: 'textarea' as const, required: true },
];
const INFO_FIELDS = [
  { name: 'title', label: 'Data, drawing or plan', required: true, datalist: ['Title deed & SG diagram', 'Existing building drawings', 'Services as-built drawings', 'Previous geotechnical report', 'Topographical survey', 'Municipal services records'] },
  { name: 'heldBy', label: 'Held by', placeholder: 'e.g. Client, municipality, previous consultant' },
];

/** "My Stage 1": a consultant's PROCSA Stage 1 responsibilities with the
 * action that completes each one right next to it — so the Architect, QS
 * and each engineer can work through their own list without hunting
 * across sections. Staff without a consultant role see who's done what on
 * the Responsibilities page instead. */
export function MyStage1Section({ projectId, onGoTo, onChange }: { projectId: string; onGoTo: (section: string) => void; onChange?: () => void }) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<MyRole | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    authedFetch<MyRole>(`/projects/${projectId}/inception/my-role`)
      .then((d) => {
        setData(d);
        setOpen((current) => current ?? d.roles.flatMap((r) => r.items.map((i) => `${r.key}:${i.code}:${i.done}`)).find((k) => k.endsWith(':false'))?.replace(/:false$/, '') ?? null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load your Stage 1 responsibilities.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const done = () => {
    load();
    onChange?.();
  };

  if (error && !data) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  if (data.roles.length === 0) {
    return (
      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">My Stage 1</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          {data.members.length
            ? `You're on this project as ${data.members.map((m) => projectMemberRoleLabel(m.role)).join(', ')}, which has no PROCSA Stage 1 list of its own.`
            : "You're not a member of this project's team."}{' '}
          Every role&apos;s list is on{' '}
          <button type="button" onClick={() => onGoTo('responsibilities')} className="font-medium text-emerald-700 underline dark:text-emerald-400">
            Responsibilities by role
          </button>
          .
        </p>
      </div>
    );
  }

  function action(item: Item): ReactNode {
    const ev = item.evidenceRule;
    switch (ev.kind) {
      case 'briefInput':
        return <BriefInput projectId={projectId} onDone={done} onOpenBrief={() => onGoTo('brief')} />;
      case 'attendedInitiationMeeting': {
        const initiation = data!.meetings.filter((m) => m.meetingType === 'INITIATION');
        return initiation.length ? (
          <ul className="space-y-1 text-sm">
            {initiation.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2">
                <CalendarClock size={13} className="text-slate-400" />
                <span className="text-slate-700 dark:text-slate-200">{m.title}</span>
                <span className="text-xs text-slate-500">{new Date(m.scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="text-xs text-slate-400">
                  {m.status === 'HELD' ? (m.attendees[0]?.present ? 'you attended' : 'held — attendance not recorded as present') : m.status.toLowerCase()}
                </span>
              </li>
            ))}
            <li className="text-xs text-slate-500">The Project Manager records attendance when the meeting is held.</li>
          </ul>
        ) : (
          <p className="text-sm text-slate-500">You haven&apos;t been invited to an initiation meeting yet — the Project Manager schedules it on the Meetings tab.</p>
        );
      }
      case 'advice': {
        const e = ev as Extract<Evidence, { kind: 'advice' }>;
        return (
          <div className="space-y-4">
            <AdviceQuick projectId={projectId} topic={e.topic} onDone={done} />
            {e.orConstraintRaised && (
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="mb-2 text-xs text-slate-500">…or log a site right / constraint directly</p>
                <QuickAdd projectId={projectId} register="site-constraints" fields={CONSTRAINT_FIELDS} submitLabel="Add constraint" onDone={done} />
              </div>
            )}
            {e.orInvestigationRecommended && (
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="mb-2 text-xs text-slate-500">…or recommend a survey / investigation</p>
                <QuickAdd projectId={projectId} register="site-investigations" fields={INVESTIGATION_FIELDS} submitLabel="Recommend investigation" onDone={done} />
              </div>
            )}
            {e.orServiceRecommended && (
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="mb-2 text-xs text-slate-500">…or add a consultant / service the project needs</p>
                <QuickAdd projectId={projectId} register="required-services" fields={SERVICE_FIELDS} submitLabel="Recommend service" onDone={done} />
              </div>
            )}
            {e.orCriterionRaised && (
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="mb-2 text-xs text-slate-500">…or set a measurable financial design criterion</p>
                <QuickAdd projectId={projectId} register="design-criteria" fields={CRITERION_FIELDS} submitLabel="Add criterion" onDone={done} />
              </div>
            )}
          </div>
        );
      }
      case 'ownScope':
        return data!.appointments.length ? (
          <div className="space-y-4">
            {data!.appointments.map((a) => (
              <MyAppointmentScope key={a.id} projectId={projectId} appointment={a} onDone={done} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Your firm&apos;s appointment isn&apos;t on this project yet.</p>
        );
      case 'ownAgreementSigned':
        return data!.appointments.length ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Review the terms and sign under &ldquo;Your appointment&rdquo; at the top of this page once Setjeka issues the agreement.</p>
        ) : (
          <p className="text-sm text-slate-500">Your firm&apos;s appointment isn&apos;t on this project yet.</p>
        );
      case 'informationOwned':
        return (
          <div className="space-y-2">
            <QuickAdd projectId={projectId} register="information" fields={INFO_FIELDS} submitLabel="Add to the information register" onDone={done} />
            <button type="button" onClick={() => onGoTo('information')} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Open the information register →
            </button>
          </div>
        );
      case 'informationShared':
        return (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Upload what you hold to Documents and issue it to the team with a transmittal.{' '}
            <Link href={`/projects/${projectId}?tab=documents`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Go to Documents & transmittals →
            </Link>
          </p>
        );
      default: {
        const key = (ev as { key?: string }).key;
        const section = key ? SECTION_FOR_KEY[key] : ev.kind === 'siteConstraintsLogged' ? 'site' : 'team';
        return (
          <button type="button" onClick={() => onGoTo(section)} className={secondaryButton}>
            Go to it
            <ArrowRight size={13} />
          </button>
        );
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* Not every PROCSA list has an agreement item (the Architect's
          doesn't), but every appointed firm signs one — so it's always here. */}
      {data.appointments.length > 0 && (
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Your appointment</h2>
          <div className="mt-2 space-y-3">
            {data.appointments.map((a) => (
              <MyAgreement key={a.id} projectId={projectId} appointment={a} onDone={done} />
            ))}
          </div>
        </div>
      )}
      {data.roles.map((role) => {
        const count = role.items.filter((i) => i.done).length;
        return (
          <div key={role.key} className={cardClass}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">My Stage 1 — {role.label}</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Your PROCSA Inception responsibilities. Each one ticks itself when the work is on file.</p>
              </div>
              <p className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {count}
                <span className="text-sm text-slate-400">/{role.items.length}</span>
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${(count / role.items.length) * 100}%` }} />
            </div>
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {role.items.map((item) => {
                const key = `${role.key}:${item.code}`;
                const isOpen = open === key;
                return (
                  <li key={item.code}>
                    <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-start gap-2.5 py-2.5 text-left">
                      {item.done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <Circle size={16} className="mt-0.5 shrink-0 text-slate-300 dark:text-slate-600" />}
                      <span className="w-9 shrink-0 font-mono text-[11px] leading-5 text-slate-400">{item.code}</span>
                      <span className="flex-1">
                        <span className={`text-sm ${item.done ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{item.text}</span>
                        {item.evidence && <span className="block text-[11px] text-emerald-700 dark:text-emerald-400">✓ {item.evidence}</span>}
                        {item.manualCheck && (
                          <span className="block text-[11px] text-slate-500">
                            Signed off by {item.manualCheck.doneBy}
                            {item.manualCheck.note && ` — ${item.manualCheck.note}`}
                          </span>
                        )}
                      </span>
                      <ChevronDown size={14} className={`mt-1 shrink-0 text-slate-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                    </button>
                    {isOpen && <div className="mb-3 ml-[60px] rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">{action(item)}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
