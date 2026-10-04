'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, formatMoney, inputClass, isExecutive, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { EvidenceFiles } from './EvidenceFiles';

type Status = 'INVOICED' | 'APPROVED' | 'PAID' | 'REJECTED';

interface Payment {
  id: string;
  description: string;
  contractor: { id: string; name: string } | null;
  appointment: { id: string; discipline: string | null } | null;
  payeeName: string | null;
  invoiceReference: string | null;
  invoiceDate: string | null;
  amount: number;
  currency: string;
  status: Status;
  recordedById: string;
  recordedBy: { fullName: string };
  approvedBy: { fullName: string } | null;
  approvedAt: string | null;
  decisionComment: string | null;
  paidAt: string | null;
  paymentReference: string | null;
}

interface Appointment {
  id: string;
  discipline: string | null;
  contractor: { id: string; name: string };
}

const STATUS_LABEL: Record<Status, string> = { INVOICED: 'Awaiting Executive', APPROVED: 'Approved — to pay', PAID: 'Paid', REJECTED: 'Rejected' };
const STATUS_TONE: Record<Status, string> = {
  INVOICED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

/** PROCSA 0.8 "Process Payments to all project creditors" during Stage 0.
 * The Development Manager records the invoice; an Executive (not the person
 * who recorded it) approves it; it's then marked paid. Paid consultant
 * invoices follow the appointment into the project at conversion. */
export function PaymentsPanel({ opportunityId, currency, onChange }: { opportunityId: string; currency: string; onChange: () => void }) {
  const { authedFetch, user } = useAuth();
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ description: '', appointmentId: '', payeeName: '', invoiceReference: '', invoiceDate: '', amount: '' });
  const [comment, setComment] = useState<Record<string, string>>({});
  const base = `/opportunities/${opportunityId}/payments`;
  const exec = isExecutive(user);

  const load = () =>
    authedFetch<Payment[]>(base)
      .then(setPayments)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load payments.'));

  useEffect(() => {
    load();
    authedFetch<Appointment[]>(`/opportunities/${opportunityId}/appointments`).then(setAppointments).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function run(fn: () => Promise<unknown>, failure: string) {
    setError(null);
    try {
      await fn();
      await load();
      onChange();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
      return false;
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const appointment = appointments.find((a) => a.id === form.appointmentId);
    const ok = await run(
      () =>
        authedFetch(base, {
          method: 'POST',
          body: {
            description: form.description.trim(),
            appointmentId: appointment?.id,
            contractorId: appointment?.contractor.id,
            payeeName: appointment ? undefined : form.payeeName.trim() || undefined,
            invoiceReference: form.invoiceReference.trim() || undefined,
            invoiceDate: form.invoiceDate || undefined,
            amount: Number(form.amount),
            currency,
          },
        }),
      'Failed to record the payment.',
    );
    if (ok) {
      setAdding(false);
      setForm({ description: '', appointmentId: '', payeeName: '', invoiceReference: '', invoiceDate: '', amount: '' });
    }
  }

  const sum = (s: Status[]) => (payments ?? []).filter((p) => s.includes(p.status)).reduce((t, p) => t + p.amount, 0);

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Banknote size={14} />
            Payments to creditors <span className="font-normal text-slate-400">· PROCSA 0.8</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Consultant fees, land deposits, research and other Stage 0 costs. Recorded by the Development Manager, approved by an Executive, then paid.
          </p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={secondaryButton}>
            <Plus size={14} />
            Record invoice
          </button>
        )}
      </div>

      {payments && payments.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-center dark:bg-slate-800/50">
          {(
            [
              ['Awaiting approval', ['INVOICED']],
              ['Approved, unpaid', ['APPROVED']],
              ['Paid', ['PAID']],
            ] as [string, Status[]][]
          ).map(([label, s]) => (
            <div key={label}>
              <p className="text-[11px] text-slate-400">{label}</p>
              <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatMoney(sum(s), currency)}</p>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {adding && (
        <form onSubmit={add} className="mt-3 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="pay-desc">
              What for <span className="text-red-500">*</span>
            </label>
            <input id="pay-desc" className={inputClass} placeholder="e.g. Architect concept fee; deposit on Erf 9" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pay-appt">
              Appointed consultant
            </label>
            <Select
              id="pay-appt"
              value={form.appointmentId}
              onChange={(v) => setForm({ ...form, appointmentId: v })}
              className={inputClass}
              options={[{ value: '', label: 'Not a consultant — another creditor' }, ...appointments.map((a) => ({ value: a.id, label: `${a.contractor.name}${a.discipline ? ` (${a.discipline})` : ''}` }))]}
            />
          </div>
          {!form.appointmentId && (
            <div>
              <label className={labelClass} htmlFor="pay-payee">
                Payee <span className="text-red-500">*</span>
              </label>
              <input id="pay-payee" className={inputClass} placeholder="e.g. Seller, conveyancer, research firm" value={form.payeeName} onChange={(e) => setForm({ ...form, payeeName: e.target.value })} />
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor="pay-inv">
              Invoice reference
            </label>
            <input id="pay-inv" className={inputClass} value={form.invoiceReference} onChange={(e) => setForm({ ...form, invoiceReference: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pay-date">
              Invoice date
            </label>
            <input id="pay-date" type="date" className={inputClass} value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="pay-amount">
              Amount ({currency}) <span className="text-red-500">*</span>
            </label>
            <input id="pay-amount" type="number" min={0} step="any" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={!form.description.trim() || !(Number(form.amount) > 0) || (!form.appointmentId && !form.payeeName.trim())} className={primaryButton}>
              Record
            </button>
            <button type="button" onClick={() => setAdding(false)} className={secondaryButton}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {payments === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : payments.length === 0 ? (
        !adding && <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No Stage 0 payments yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {payments.map((p) => {
            const canDecide = p.status === 'INVOICED' && exec && p.recordedById !== user?.id;
            return (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.contractor?.name ?? p.payeeName}</span>
                  <span className="text-xs text-slate-500">{p.description}</span>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatMoney(p.amount, p.currency)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  {p.status === 'INVOICED' && (
                    <button
                      type="button"
                      aria-label="Delete payment"
                      onClick={() => confirm('Delete this payment?') && run(() => authedFetch(`${base}/${p.id}`, { method: 'DELETE' }), 'Failed to delete.')}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {[
                    p.invoiceReference && `Invoice ${p.invoiceReference}`,
                    p.invoiceDate && new Date(p.invoiceDate).toLocaleDateString(),
                    `recorded by ${p.recordedBy.fullName}`,
                    p.approvedBy && `${p.status === 'REJECTED' ? 'rejected' : 'approved'} by ${p.approvedBy.fullName}`,
                    p.paidAt && `paid ${new Date(p.paidAt).toLocaleDateString()}${p.paymentReference ? ` (${p.paymentReference})` : ''}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {p.decisionComment && <p className="mt-0.5 text-xs text-slate-500">“{p.decisionComment}”</p>}
                {(canDecide || p.status === 'APPROVED') && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      aria-label={canDecide ? 'Decision comment' : 'Payment reference'}
                      className={`${inputClass} h-8 min-w-[180px] flex-1 text-xs`}
                      placeholder={canDecide ? 'Comment (required to reject)' : 'Payment reference, e.g. EFT number'}
                      value={comment[p.id] ?? ''}
                      onChange={(e) => setComment({ ...comment, [p.id]: e.target.value })}
                    />
                    {canDecide ? (
                      <>
                        <button type="button" onClick={() => run(() => authedFetch(`${base}/${p.id}/decide`, { method: 'POST', body: { approve: true, comment: comment[p.id] || undefined } }), 'Failed to approve.')} className={primaryButton}>
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={!(comment[p.id] ?? '').trim()}
                          onClick={() => run(() => authedFetch(`${base}/${p.id}/decide`, { method: 'POST', body: { approve: false, comment: comment[p.id] } }), 'Failed to reject.')}
                          className={secondaryButton}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => run(() => authedFetch(`${base}/${p.id}/paid`, { method: 'POST', body: { paymentReference: comment[p.id] || undefined } }), 'Failed to mark paid.')} className={primaryButton}>
                        Mark paid
                      </button>
                    )}
                  </div>
                )}
                {p.status === 'INVOICED' && !canDecide && <p className="mt-1 text-xs text-slate-400">Waiting for an Executive who didn&apos;t record it to approve.</p>}
                <div className="mt-1.5">
                  <EvidenceFiles opportunityId={opportunityId} linkType="PAYMENT" linkId={p.id} compact />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
