'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { costCodeLabel, formatRate, type CostCode } from '@/lib/commercial';
import { CommentThread } from '@/components/project/CommentThread';

type Status = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN';
type Reason = 'CLIENT_INSTRUCTION' | 'DESIGN_CHANGE' | 'SITE_CONDITION' | 'RFI' | 'OMISSION' | 'OTHER';

interface Variation {
  id: string;
  number: string;
  title: string;
  description: string | null;
  reason: Reason;
  status: Status;
  estimatedValue: number;
  assessedValue: number | null;
  timeImpactDays: number | null;
  costCode: { id: string; code: string; name: string } | null;
  rfi: { id: string; rfiNumber: string; title: string } | null;
  raisedBy: { fullName: string };
  assessedBy: { fullName: string } | null;
  decidedBy: { fullName: string } | null;
  decisionComment: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  events: { id: string; toStatus: Status; comment: string | null; createdAt: string; actor: { fullName: string } }[];
}

const STATUS_LABEL: Record<Status, string> = { DRAFT: 'Draft', SUBMITTED: 'With the client', APPROVED: 'Approved', REJECTED: 'Rejected', WITHDRAWN: 'Withdrawn' };
const STATUS_TONE: Record<Status, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  SUBMITTED: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  WITHDRAWN: 'bg-slate-100 text-slate-400 dark:bg-slate-800',
};
const REASON_LABEL: Record<Reason, string> = {
  CLIENT_INSTRUCTION: 'Client instruction',
  DESIGN_CHANGE: 'Design change',
  SITE_CONDITION: 'Site condition',
  RFI: 'From an RFI',
  OMISSION: 'Omission',
  OTHER: 'Other',
};

const value = (v: Variation) => v.assessedValue ?? v.estimatedValue;

/** Register COM "Variation/change order": raised and assessed by Setjeka
 * (the QS prices it), decided by the client alone. An approved variation
 * draws the contingency down. */
export function VariationsPanel({ projectId, currency, isClient, onChanged }: { projectId: string; currency: string; isClient: boolean; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<Variation[] | null>(null);
  const [codes, setCodes] = useState<CostCode[]>([]);
  const [rfis, setRfis] = useState<{ id: string; rfiNumber: string; title: string }[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', reason: 'CLIENT_INSTRUCTION' as Reason, estimatedValue: '', timeImpactDays: '', costCodeId: '', rfiId: '' });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/commercial/variations`;

  const load = () =>
    authedFetch<Variation[]>(base)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load variations.'));

  useEffect(() => {
    load();
    if (!isClient) {
      authedFetch<CostCode[]>('/cost-codes').then(setCodes).catch(() => {});
      authedFetch<{ id: string; rfiNumber: string; title: string }[]>(`/projects/${projectId}/rfis`).then(setRfis).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isClient]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      authedFetch(base, {
        method: 'POST',
        body: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          reason: form.reason,
          estimatedValue: Number(form.estimatedValue),
          timeImpactDays: form.timeImpactDays ? Number(form.timeImpactDays) : undefined,
          costCodeId: form.costCodeId || undefined,
          rfiId: form.rfiId || undefined,
        },
      }),
    );
    setCreating(false);
    setForm({ title: '', description: '', reason: 'CLIENT_INSTRUCTION', estimatedValue: '', timeImpactDays: '', costCodeId: '', rfiId: '' });
  }

  const input = (id: string, key: string) => inputs[`${id}:${key}`] ?? '';
  const setInput = (id: string, key: string, v: string) => setInputs({ ...inputs, [`${id}:${key}`]: v });

  if (error && !rows) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!rows) return <p className="text-sm text-slate-400">Loading…</p>;

  const pending = rows.filter((v) => v.status === 'SUBMITTED');
  const approvedTotal = rows.filter((v) => v.status === 'APPROVED').reduce((s, v) => s + value(v), 0);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Variations &amp; change orders</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              {isClient
                ? 'Changes to the works that need your decision. Approving one adds it to the budget, funded from the contingency. Only you can approve or reject.'
                : 'Raise a variation, have the QS assess its value, then send it to the client. Only the client can approve or reject it; once approved it draws on the contingency.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {pending.length} awaiting the client · approved so far {formatRate(approvedTotal, currency)}
            </p>
          </div>
          {!isClient && !creating && (
            <button type="button" onClick={() => setCreating(true)} className={secondaryButton}>
              <Plus size={14} />
              Raise variation
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={create} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="vo-title">
                Title
              </label>
              <input id="vo-title" className={inputClass} placeholder="e.g. Change window frames to anodised bronze" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="vo-reason">
                Reason
              </label>
              <Select id="vo-reason" value={form.reason} onChange={(v) => setForm({ ...form, reason: v as Reason })} options={(Object.keys(REASON_LABEL) as Reason[]).map((r) => ({ value: r, label: REASON_LABEL[r] }))} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="vo-value">
                Estimated value ({currency}; negative for an omission)
              </label>
              <input id="vo-value" type="number" step="any" className={`${inputClass} text-right`} value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="vo-cc">
                Cost code
              </label>
              <Select id="vo-cc" value={form.costCodeId} onChange={(v) => setForm({ ...form, costCodeId: v })} options={[{ value: '', label: 'Not coded' }, ...codes.map((c) => ({ value: c.id, label: `${c.code} ${c.name}` }))]} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="vo-rfi">
                Arising from RFI
              </label>
              <Select id="vo-rfi" value={form.rfiId} onChange={(v) => setForm({ ...form, rfiId: v, reason: v ? 'RFI' : form.reason })} options={[{ value: '', label: '—' }, ...rfis.map((r) => ({ value: r.id, label: `${r.rfiNumber} ${r.title}` }))]} className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="vo-days">
                Time impact (days)
              </label>
              <input id="vo-days" type="number" step="1" className={inputClass} value={form.timeImpactDays} onChange={(e) => setForm({ ...form, timeImpactDays: e.target.value })} />
            </div>
            <div className="sm:col-span-4">
              <label className={labelClass} htmlFor="vo-desc">
                Description
              </label>
              <textarea id="vo-desc" className={`${inputClass} h-16 resize-y py-2`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-2 sm:col-span-4">
              <button type="submit" disabled={!form.title.trim() || form.estimatedValue === ''} className={primaryButton}>
                Raise variation
              </button>
              <button type="button" onClick={() => setCreating(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {rows.length === 0 ? (
        <p className={`${cardClass} text-sm text-slate-400`}>No variations on this project.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((v) => (
            <li key={v.id} className={cardClass}>
              <button type="button" onClick={() => setOpen(open === v.id ? null : v.id)} className="flex w-full flex-wrap items-center gap-2 text-left">
                <ChevronDown size={14} className={`text-slate-400 transition-transform ${open === v.id ? '' : '-rotate-90'}`} />
                <span className="font-mono text-xs text-slate-500">{v.number}</span>
                <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{v.title}</span>
                <span className={`text-sm tabular-nums ${value(v) < 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}`}>{formatRate(value(v), currency)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
              </button>
              {open === v.id && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
                  <p className="text-xs text-slate-500">
                    {REASON_LABEL[v.reason]} · {costCodeLabel(v.costCode)}
                    {v.rfi && ` · ${v.rfi.rfiNumber}`}
                    {v.timeImpactDays != null && ` · ${v.timeImpactDays} day${Math.abs(v.timeImpactDays) === 1 ? '' : 's'} time impact`}
                    {' · '}estimated {formatRate(v.estimatedValue)}
                    {v.assessedValue != null && `, assessed ${formatRate(v.assessedValue)}${v.assessedBy ? ` by ${v.assessedBy.fullName}` : ''}`}
                  </p>
                  {v.description && <p className="whitespace-pre-line text-slate-700 dark:text-slate-200">{v.description}</p>}
                  {v.decisionComment && (
                    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                      {v.decidedBy?.fullName}: {v.decisionComment}
                    </p>
                  )}

                  {!isClient && v.status === 'DRAFT' && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-44">
                        <label className={labelClass} htmlFor={`assess-${v.id}`}>
                          QS assessed value
                        </label>
                        <input id={`assess-${v.id}`} type="number" step="any" className={`${inputClass} text-right`} placeholder={String(v.assessedValue ?? v.estimatedValue)} value={input(v.id, 'assess')} onChange={(e) => setInput(v.id, 'assess', e.target.value)} />
                      </div>
                      <button type="button" disabled={input(v.id, 'assess') === ''} onClick={() => run(() => authedFetch(`${base}/${v.id}/assess`, { method: 'POST', body: { assessedValue: Number(input(v.id, 'assess')) } }))} className={secondaryButton}>
                        Record assessment
                      </button>
                      <button type="button" onClick={() => run(() => authedFetch(`${base}/${v.id}/submit`, { method: 'POST', body: {} }))} className={primaryButton}>
                        Send to the client
                      </button>
                      <button type="button" onClick={() => confirm(`Delete draft ${v.number}?`) && run(() => authedFetch(`${base}/${v.id}`, { method: 'DELETE' }))} className={secondaryButton}>
                        Delete
                      </button>
                    </div>
                  )}
                  {!isClient && v.status === 'SUBMITTED' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="flex-1 text-xs text-slate-500">Waiting for the client&apos;s decision. Setjeka cannot approve on the client&apos;s behalf.</p>
                      <button type="button" onClick={() => run(() => authedFetch(`${base}/${v.id}/withdraw`, { method: 'POST', body: {} }))} className={secondaryButton}>
                        Withdraw
                      </button>
                    </div>
                  )}
                  {isClient && v.status === 'SUBMITTED' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input aria-label="Decision comment" className={`${inputClass} min-w-[220px] flex-1`} placeholder="Comment (required to reject)" value={input(v.id, 'comment')} onChange={(e) => setInput(v.id, 'comment', e.target.value)} />
                      <button type="button" onClick={() => run(() => authedFetch(`${base}/${v.id}/decide`, { method: 'POST', body: { approve: true, comment: input(v.id, 'comment') || undefined } }))} className={primaryButton}>
                        Approve {formatRate(value(v), currency)}
                      </button>
                      <button type="button" disabled={!input(v.id, 'comment').trim()} onClick={() => run(() => authedFetch(`${base}/${v.id}/decide`, { method: 'POST', body: { approve: false, comment: input(v.id, 'comment') } }))} className={secondaryButton}>
                        Reject
                      </button>
                    </div>
                  )}

                  <ol className="space-y-0.5 text-xs text-slate-500">
                    {v.events.map((e) => (
                      <li key={e.id}>
                        {new Date(e.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · {e.actor.fullName} · {STATUS_LABEL[e.toStatus]}
                        {e.comment && ` — ${e.comment}`}
                      </li>
                    ))}
                  </ol>
                  <CommentThread projectId={projectId} entityType="VARIATION" entityId={v.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
