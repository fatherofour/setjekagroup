'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { money } from '@/lib/qs';
import { cardCls, fmtDay, fmtDayTime, inputCls, labelCls, primaryBtn, secondaryBtn, selectCls, textareaCls, todayIso } from '@/lib/architect';

type Status = 'NOTIFIED' | 'SUBMITTED' | 'GRANTED' | 'PARTLY_GRANTED' | 'REJECTED' | 'WITHDRAWN';
type Cause = 'VARIATION' | 'LATE_INFORMATION' | 'CLIENT_DELAY' | 'SITE_ACCESS' | 'WEATHER' | 'STATUTORY' | 'FORCE_MAJEURE' | 'OTHER';

interface ContractTime {
  id: string;
  title: string;
  contractor: { name: string };
  startDate: string | null;
  completionDate: string | null;
  penaltyPerDay: number | null;
  terms: { noticeWithinDays: number; claimWithinDays: number; assessWithinDays: number; completion: string };
  grantedDays: number;
  revisedCompletion: string | null;
  daysLate: number;
  penaltyToDate: number;
  openClaims: number;
  can: { notify: boolean; penalty: boolean };
}

interface Claim {
  id: string;
  number: string;
  title: string;
  cause: Cause;
  description: string;
  status: Status;
  eventStartedAt: string;
  eventEndedAt: string | null;
  notifiedAt: string;
  lateNoticeDays: number | null;
  claimDueAt: string;
  requestedDays: number | null;
  costClaimed: number | null;
  particulars: string | null;
  submittedAt: string | null;
  assessDueAt: string | null;
  grantedDays: number | null;
  grantedCost: number | null;
  assessment: string | null;
  decidedAt: string | null;
  response: 'ACCEPTED' | 'DISPUTED' | null;
  responseNote: string | null;
  claimOverdue: boolean;
  assessOverdue: boolean;
  contract: { id: string; title: string; contractor: { name: string } };
  scheduleActivity: { id: string; name: string } | null;
  rfi: { id: string; rfiNumber: string; title: string } | null;
  notifiedBy: { id: string; fullName: string };
  decidedBy: { fullName: string } | null;
  costVariation: { id: string; number: string; status: string } | null;
  history: { status: string; at: string; name: string; comment: string | null }[];
  weather?: { days: number; wetDays: number; rainMm: number };
  can: { submit: boolean; withdraw: boolean; assess: boolean; respond: boolean; raiseVariation: boolean };
}

const STATUS: Record<Status, { label: string; tone: string }> = {
  NOTIFIED: { label: 'Notice given, claim to follow', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  SUBMITTED: { label: 'Claimed, to assess', tone: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  GRANTED: { label: 'Granted', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  PARTLY_GRANTED: { label: 'Partly granted', tone: 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  REJECTED: { label: 'Not granted', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
};
const CAUSE: Record<Cause, string> = {
  VARIATION: 'A variation',
  LATE_INFORMATION: 'Late drawings or information',
  CLIENT_DELAY: 'Delay by the client',
  SITE_ACCESS: 'Site access or possession',
  WEATHER: 'Exceptional weather',
  STATUTORY: 'Authorities or utilities',
  FORCE_MAJEURE: 'Force majeure',
  OTHER: 'Other',
};
const err = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const errBox = 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300';
const HISTORY_LABEL: Record<string, string> = { ...Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label])), ACCEPTED: 'Assessment accepted', DISPUTED: 'Assessment disputed' };

function Detail({ projectId, id, onBack, onChanged }: { projectId: string; id: string; onBack: () => void; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [c, setC] = useState<Claim | null>(null);
  const [claim, setClaim] = useState({ requestedDays: '', costClaimed: '', particulars: '', eventEndedAt: '' });
  const [assess, setAssess] = useState({ grantedDays: '', grantedCost: '', assessment: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/time-claims/${id}`;

  useEffect(() => {
    authedFetch<Claim>(base)
      .then((x) => {
        setC(x);
        setAssess({ grantedDays: String(x.grantedDays ?? x.requestedDays ?? ''), grantedCost: x.grantedCost != null ? String(x.grantedCost) : '', assessment: x.assessment ?? '' });
      })
      .catch((e) => setError(err(e, 'Failed to load the claim.')));
  }, [authedFetch, base]);

  async function act(path: string, body: object = {}) {
    setError(null);
    setBusy(true);
    try {
      setC(await authedFetch<Claim>(`${base}/${path}`, { method: 'POST', body }));
      setNote('');
      onChanged();
    } catch (e) {
      setError(err(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  if (!c) return <p className={error ? errBox : 'text-sm text-slate-400'}>{error ?? 'Loading…'}</p>;
  return (
    <div className={`${cardCls} p-4`}>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        <ArrowLeft size={13} /> All claims
      </button>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {c.number} · {c.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {CAUSE[c.cause]} · {c.contract.title} ({c.contract.contractor.name}) · from {fmtDay(c.eventStartedAt)}
            {c.eventEndedAt && ` to ${fmtDay(c.eventEndedAt)}`} · notice by {c.notifiedBy.fullName} on {fmtDay(c.notifiedAt)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
      </div>
      {error && <p className={`mt-3 ${errBox}`}>{error}</p>}
      {c.lateNoticeDays != null && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">Notice was given {c.lateNoticeDays} days after the contract&apos;s notice period.</p>}
      <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{c.description}</p>
      <p className="mt-2 text-xs text-slate-500">
        {c.scheduleActivity && `Activity "${c.scheduleActivity.name}". `}
        {c.rfi && `RFI ${c.rfi.rfiNumber} ${c.rfi.title}. `}
        {c.status === 'NOTIFIED' && <span className={c.claimOverdue ? 'font-medium text-red-700 dark:text-red-400' : ''}>The claim is due by {fmtDay(c.claimDueAt)}.</span>}
        {c.status === 'SUBMITTED' && c.assessDueAt && <span className={c.assessOverdue ? 'font-medium text-red-700 dark:text-red-400' : ''}> To be assessed by {fmtDay(c.assessDueAt)}.</span>}
      </p>
      {c.weather && c.weather.days > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          Site weather over the delay: {c.weather.days} days recorded, {c.weather.wetDays} with 10 mm of rain or more, {c.weather.rainMm} mm in all.
        </p>
      )}

      {c.requestedDays != null && (
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4 dark:bg-slate-800/40">
          <div>
            <dt className="text-xs font-medium text-slate-500">Days claimed</dt>
            <dd className="tabular-nums text-slate-900 dark:text-slate-100">{c.requestedDays}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Costs claimed</dt>
            <dd className="tabular-nums text-slate-900 dark:text-slate-100">{c.costClaimed ? money(c.costClaimed) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Days granted</dt>
            <dd className="tabular-nums text-slate-900 dark:text-slate-100">{c.grantedDays ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Costs granted</dt>
            <dd className="tabular-nums text-slate-900 dark:text-slate-100">{c.grantedCost ? money(c.grantedCost) : '—'}</dd>
          </div>
        </dl>
      )}
      {c.particulars && (
        <div className="mt-3 text-sm">
          <p className="text-xs font-medium text-slate-500">The contractor&apos;s particulars</p>
          <p className="whitespace-pre-line text-slate-700 dark:text-slate-200">{c.particulars}</p>
        </div>
      )}
      {c.assessment && (
        <div className="mt-3 text-sm">
          <p className="text-xs font-medium text-slate-500">
            Assessment{c.decidedBy && ` by ${c.decidedBy.fullName}, ${fmtDay(c.decidedAt)}`}
          </p>
          <p className="whitespace-pre-line text-slate-700 dark:text-slate-200">{c.assessment}</p>
        </div>
      )}
      {c.response && (
        <p className={`mt-2 text-xs ${c.response === 'DISPUTED' ? 'text-red-700 dark:text-red-400' : 'text-slate-500'}`}>
          The contractor {c.response === 'ACCEPTED' ? 'accepted' : 'disputes'} the assessment{c.responseNote && `: ${c.responseNote}`}
        </p>
      )}
      {c.costVariation && (
        <p className="mt-2 text-xs text-slate-500">
          The costs are with the client as{' '}
          <Link href={`/projects/${projectId}?tab=commercial`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            {c.costVariation.number}
          </Link>{' '}
          ({c.costVariation.status.toLowerCase()}).
        </p>
      )}

      {c.can.submit && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            act('submit', { requestedDays: Number(claim.requestedDays), costClaimed: claim.costClaimed ? Number(claim.costClaimed) : undefined, particulars: claim.particulars, eventEndedAt: claim.eventEndedAt || undefined });
          }}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700"
        >
          <p className="text-sm font-medium text-slate-800 sm:col-span-3 dark:text-slate-100">Your claim</p>
          <label className={labelCls}>
            Days claimed
            <input type="number" min={1} className={`${inputCls} mt-0.5`} value={claim.requestedDays} onChange={(e) => setClaim({ ...claim, requestedDays: e.target.value })} />
          </label>
          <label className={labelCls}>
            Costs claimed (optional)
            <input type="number" min={0} step="any" className={`${inputCls} mt-0.5`} value={claim.costClaimed} onChange={(e) => setClaim({ ...claim, costClaimed: e.target.value })} />
          </label>
          <label className={labelCls}>
            The delay ended on
            <input type="date" className={`${inputCls} mt-0.5`} value={claim.eventEndedAt} onChange={(e) => setClaim({ ...claim, eventEndedAt: e.target.value })} />
          </label>
          <label className={`${labelCls} sm:col-span-3`}>
            Particulars: what happened, its effect on the programme and how the days and costs are worked out
            <textarea className={`${textareaCls} mt-0.5`} rows={4} value={claim.particulars} onChange={(e) => setClaim({ ...claim, particulars: e.target.value })} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy || !Number(claim.requestedDays) || !claim.particulars.trim()} className={primaryBtn}>
              Submit the claim
            </button>
          </div>
        </form>
      )}

      {c.can.assess && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            act('assess', { grantedDays: Number(assess.grantedDays), grantedCost: assess.grantedCost ? Number(assess.grantedCost) : undefined, assessment: assess.assessment });
          }}
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700"
        >
          <p className="text-sm font-medium text-slate-800 sm:col-span-3 dark:text-slate-100">{c.response === 'DISPUTED' ? 'Assess it again' : 'Your assessment'}</p>
          <label className={labelCls}>
            Days granted (of {c.requestedDays})
            <input type="number" min={0} max={c.requestedDays ?? undefined} className={`${inputCls} mt-0.5`} value={assess.grantedDays} onChange={(e) => setAssess({ ...assess, grantedDays: e.target.value })} />
          </label>
          {(c.costClaimed ?? 0) > 0 && (
            <label className={labelCls}>
              Costs granted (of {money(c.costClaimed)})
              <input type="number" min={0} step="any" className={`${inputCls} mt-0.5`} value={assess.grantedCost} onChange={(e) => setAssess({ ...assess, grantedCost: e.target.value })} />
            </label>
          )}
          <label className={`${labelCls} sm:col-span-3`}>
            Reasons
            <textarea className={`${textareaCls} mt-0.5`} rows={3} value={assess.assessment} onChange={(e) => setAssess({ ...assess, assessment: e.target.value })} />
          </label>
          <div className="sm:col-span-3">
            <button type="submit" disabled={busy || assess.grantedDays === '' || !assess.assessment.trim()} className={primaryBtn}>
              Issue the assessment
            </button>
            <p className="mt-1 text-xs text-slate-500">Granted days move the contract&apos;s completion date. Granted costs go to the client as a variation to approve.</p>
          </div>
        </form>
      )}

      {(c.can.respond || c.can.withdraw || c.can.raiseVariation) && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          {(c.can.respond || c.can.withdraw) && (
            <label className={labelCls}>
              {c.can.respond ? 'Comment (needed to dispute)' : 'Reason (needed to withdraw)'}
              <input className={`${inputCls} mt-0.5 w-full`} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {c.can.respond && (
              <>
                <button type="button" disabled={busy} onClick={() => act('respond', { response: 'ACCEPTED', note: note || undefined })} className={primaryBtn}>
                  Accept the assessment
                </button>
                <button type="button" disabled={busy || !note.trim()} onClick={() => act('respond', { response: 'DISPUTED', note })} className={secondaryBtn}>
                  Dispute it
                </button>
              </>
            )}
            {c.can.withdraw && (
              <button type="button" disabled={busy || !note.trim()} onClick={() => confirm(`Withdraw ${c.number}?`) && act('withdraw', { reason: note })} className={secondaryBtn}>
                Withdraw
              </button>
            )}
            {c.can.raiseVariation && (
              <button type="button" disabled={busy} onClick={() => act('variation')} className={primaryBtn}>
                Send the costs to the client as a variation
              </button>
            )}
          </div>
        </div>
      )}

      <ol className="mt-4 space-y-0.5 text-xs text-slate-500">
        {c.history.map((h, i) => (
          <li key={i}>
            {fmtDayTime(h.at)} · {h.name} · {HISTORY_LABEL[h.status] ?? h.status}
            {h.comment && ` — ${h.comment}`}
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <CommentThread projectId={projectId} entityType="TIME_CLAIM" entityId={c.id} />
      </div>
    </div>
  );
}

function ContractCard({ projectId, k, onSaved }: { projectId: string; k: ContractTime; onSaved: (x: ContractTime) => void }) {
  const { authedFetch } = useAuth();
  const [editing, setEditing] = useState(false);
  const [penalty, setPenalty] = useState(k.penaltyPerDay != null ? String(k.penaltyPerDay) : '');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={`${cardCls} p-3`}>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{k.title}</p>
      <p className="text-xs text-slate-500">{k.contractor.name}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-slate-500">{k.terms.completion} (contract)</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-100">{k.completionDate ? fmtDay(k.completionDate) : 'Not set'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Revised, with {k.grantedDays} days granted</dt>
          <dd className="font-medium text-slate-800 dark:text-slate-100">{k.revisedCompletion ? fmtDay(k.revisedCompletion) : '—'}</dd>
        </div>
        {k.daysLate > 0 && (
          <div className="col-span-2 rounded-md bg-red-50 px-2 py-1 text-red-800 dark:bg-red-950 dark:text-red-300">
            {k.daysLate} days past the revised date{k.penaltyToDate > 0 && `: penalties of ${money(k.penaltyToDate)} to date at ${money(k.penaltyPerDay)} a day`}
          </div>
        )}
      </dl>
      <p className="mt-2 text-[11px] text-slate-400">
        Notice within {k.terms.noticeWithinDays} days, claim within {k.terms.claimWithinDays}, assessment within {k.terms.assessWithinDays}.
        {k.penaltyPerDay != null && !k.daysLate && ` Penalty ${money(k.penaltyPerDay)} a day.`}
      </p>
      {error && <p className={`mt-2 ${errBox}`}>{error}</p>}
      {k.can.penalty &&
        (editing ? (
          <form
            className="mt-2 flex items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                onSaved(await authedFetch<ContractTime>(`/projects/${projectId}/time-claims/contracts/${k.id}/penalty`, { method: 'PUT', body: { penaltyPerDay: penalty === '' ? null : Number(penalty) } }));
                setEditing(false);
              } catch (e2) {
                setError(err(e2, 'Could not save.'));
              }
            }}
          >
            <label className={`${labelCls} flex-1`}>
              Penalty per day
              <input type="number" min={0} step="any" className={`${inputCls} mt-0.5`} value={penalty} onChange={(e) => setPenalty(e.target.value)} />
            </label>
            <button type="submit" className={primaryBtn}>
              Save
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            {k.penaltyPerDay != null ? 'Change the penalty' : 'Set the penalty per day'}
          </button>
        ))}
    </div>
  );
}

/** Delay notices and extension-of-time claims (the user's choice,
 * 2026-11-03). */
export function EotPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const params = useSearchParams();
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [contracts, setContracts] = useState<ContractTime[]>([]);
  const [activities, setActivities] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('claim'));
  const [adding, setAdding] = useState(false);
  const blank = { contractId: '', title: '', cause: 'LATE_INFORMATION' as Cause, description: '', eventStartedAt: todayIso(), scheduleActivityId: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    authedFetch<Claim[]>(`/projects/${projectId}/time-claims`)
      .then(setClaims)
      .catch((e) => setError(err(e, 'Failed to load the claims.')));
    authedFetch<ContractTime[]>(`/projects/${projectId}/time-claims/contracts`)
      .then(setContracts)
      .catch(() => undefined);
  }, [authedFetch, projectId]);

  useEffect(() => {
    load();
    authedFetch<{ activities: { id: string; name: string }[] }>(`/projects/${projectId}/interfaces/options`)
      .then((o) => setActivities(o.activities))
      .catch(() => undefined);
  }, [authedFetch, projectId, load]);

  const notifiable = contracts.filter((k) => k.can.notify);

  async function notify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const c = await authedFetch<Claim>(`/projects/${projectId}/time-claims`, {
        method: 'POST',
        body: { contractId: form.contractId || notifiable[0]?.id, title: form.title.trim(), cause: form.cause, description: form.description.trim(), eventStartedAt: form.eventStartedAt, scheduleActivityId: form.scheduleActivityId || undefined },
      });
      setAdding(false);
      setForm(blank);
      load();
      setSelectedId(c.id);
    } catch (e2) {
      setError(err(e2, 'Could not give notice.'));
    }
  }

  if (selectedId) return <Detail projectId={projectId} id={selectedId} onBack={() => setSelectedId(null)} onChanged={load} />;

  return (
    <div className="space-y-4">
      {error && <p className={errBox}>{error}</p>}
      <div className={`${cardCls} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <CalendarClock size={16} className="text-emerald-700 dark:text-emerald-400" /> Delays &amp; extensions of time
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              The contractor gives notice of a delay within the contract&apos;s period, then claims the days. Setjeka&apos;s PM assesses each claim; days granted move the completion date, and any costs go to the client as a variation.
            </p>
          </div>
          {notifiable.length > 0 && !adding && (
            <button type="button" onClick={() => setAdding(true)} className={secondaryBtn}>
              <Plus size={14} /> Give notice of a delay
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={notify} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            {notifiable.length > 1 && (
              <div className={`${labelCls} sm:col-span-2`}>
                Contract
                <Select aria-label="Contract" className={`${selectCls} mt-0.5 w-full`} value={form.contractId} onChange={(v) => setForm({ ...form, contractId: v })} options={[{ value: '', label: 'Choose…' }, ...notifiable.map((k) => ({ value: k.id, label: `${k.title} · ${k.contractor.name}` }))]} />
              </div>
            )}
            <label className={`${labelCls} ${notifiable.length > 1 ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
              The delay
              <input className={`${inputCls} mt-0.5`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Structural drawings for level 3 not issued" />
            </label>
            <div className={labelCls}>
              Cause
              <Select aria-label="Cause" className={`${selectCls} mt-0.5 w-full`} value={form.cause} onChange={(v) => setForm({ ...form, cause: v as Cause })} options={(Object.keys(CAUSE) as Cause[]).map((k) => ({ value: k, label: CAUSE[k] }))} />
            </div>
            <label className={labelCls}>
              It began on
              <input type="date" className={`${inputCls} mt-0.5`} value={form.eventStartedAt} onChange={(e) => setForm({ ...form, eventStartedAt: e.target.value })} />
            </label>
            <div className={`${labelCls} sm:col-span-2`}>
              Programme activity held up
              <Select aria-label="Programme activity" className={`${selectCls} mt-0.5 w-full`} value={form.scheduleActivityId} onChange={(v) => setForm({ ...form, scheduleActivityId: v })} options={[{ value: '', label: 'None' }, ...activities.map((a) => ({ value: a.id, label: a.name }))]} />
            </div>
            <label className={`${labelCls} sm:col-span-4`}>
              What happened and how it delays the works
              <textarea className={`${textareaCls} mt-0.5`} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim() || !form.description.trim() || (notifiable.length > 1 && !form.contractId)} className={primaryBtn}>
                Give notice
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {contracts.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {contracts.map((k) => (
            <ContractCard key={k.id} projectId={projectId} k={k} onSaved={(x) => setContracts((all) => all.map((y) => (y.id === x.id ? x : y)))} />
          ))}
        </div>
      )}

      {claims === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : claims.length === 0 ? (
        <p className={`${cardCls} p-4 text-sm text-slate-400`}>No delay notices or claims.</p>
      ) : (
        <ul className="space-y-2">
          {claims.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setSelectedId(c.id)} className={`${cardCls} flex w-full flex-wrap items-center gap-2 p-3 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <span className="font-mono text-xs text-slate-500">{c.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{c.title}</span>
                  <span className="block text-xs text-slate-500">
                    {CAUSE[c.cause]} · {c.contract.contractor.name}
                    {c.requestedDays != null && ` · ${c.requestedDays} days claimed`}
                    {c.grantedDays != null && ` · ${c.grantedDays} granted`}
                    {c.lateNoticeDays != null && ' · late notice'}
                  </span>
                </span>
                {(c.claimOverdue || c.assessOverdue) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300">Overdue</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
