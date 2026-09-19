'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Banknote, Check, Pencil, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { ContractorDetail, PaymentRecord } from '@/lib/contractors';
import { CURRENCY_LABEL, CURRENCY_SYMBOL, type Currency } from '@/lib/projectMeta';
import { Select } from '@/components/ui/Select';

const inputClass =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const compactInputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-100">{value || '—'}</p>
    </div>
  );
}

interface Form {
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  preferredPaymentMethod: string;
  paymentTerms: string;
  creditTerms: string;
  withholdingTaxInfo: string;
}

function toForm(c: ContractorDetail): Form {
  return {
    bankName: c.bankName ?? '',
    bankAccountName: c.bankAccountName ?? '',
    bankAccountNumber: c.bankAccountNumber ?? '',
    preferredPaymentMethod: c.preferredPaymentMethod ?? '',
    paymentTerms: c.paymentTerms ?? '',
    creditTerms: c.creditTerms ?? '',
    withholdingTaxInfo: c.withholdingTaxInfo ?? '',
  };
}

function PaymentsSection({ contractor }: { contractor: ContractorDetail }) {
  const { authedFetch } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(contractor.appointments[0]?.currency ?? 'ZAR');
  const [paymentDate, setPaymentDate] = useState('');
  const [appointmentId, setAppointmentId] = useState('');
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('');

  const load = async () => {
    try {
      const data = await authedFetch<PaymentRecord[]>(`/contractors/${contractor.id}/payments`);
      setPayments(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load payment records.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractor.id]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!amount.trim() || !paymentDate) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractor.id}/payments`, {
        method: 'POST',
        body: {
          amount: Number(amount),
          currency,
          paymentDate,
          appointmentId: appointmentId || undefined,
          reference: reference.trim() || undefined,
          method: method.trim() || undefined,
        },
      });
      setAmount('');
      setPaymentDate('');
      setAppointmentId('');
      setReference('');
      setMethod('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add payment record.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/contractors/${contractor.id}/payments/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove payment record.');
    }
  }

  // Summed per currency, never combined — adding raw USD + ZAR numbers
  // together would produce a meaningless total.
  const totalsByCurrency = (payments ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.currency] = (acc[p.currency] ?? 0) + p.amount;
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payments made</h2>
        {payments && payments.length > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total:{' '}
            {Object.entries(totalsByCurrency)
              .map(([cur, sum]) => `${CURRENCY_SYMBOL[cur as Currency]}${sum.toLocaleString()} ${cur}`)
              .join(' + ')}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {payments === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No payments recorded yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {payments.map((p) => (
            <li key={p.id} className="group/payment flex items-center gap-3 py-2">
              <Banknote size={14} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                  {CURRENCY_SYMBOL[p.currency]}
                  {p.amount.toLocaleString()} <span className="text-slate-400 dark:text-slate-500">{p.currency}</span>
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {[new Date(p.paymentDate).toLocaleDateString(), p.method, p.reference, p.appointment?.project.name].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button
                onClick={() => remove(p.id)}
                className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/payment:opacity-100 dark:hover:bg-red-950"
                aria-label="Remove payment record"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className={`${compactInputClass} flex-1`}
          />
          <Select
            value={currency}
            onChange={(v) => setCurrency(v as Currency)}
            options={Object.entries(CURRENCY_LABEL).map(([value, label]) => ({ value, label }))}
            className={compactInputClass}
          />
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={compactInputClass} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={appointmentId}
            onChange={setAppointmentId}
            options={[
              { value: '', label: 'No specific project (optional)' },
              ...contractor.appointments.map((a) => ({ value: a.id, label: a.project.name })),
            ]}
            className={`${compactInputClass} flex-1`}
          />
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" className={`${compactInputClass} flex-1`} />
          <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Method (e.g. EFT)" className={compactInputClass} />
        </div>
        <button
          type="submit"
          disabled={saving || !amount.trim() || !paymentDate}
          className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          <Banknote size={13} />
          Record payment
        </button>
      </form>
    </div>
  );
}

export function OrganisationFinancialTab({ contractor, onSaved }: { contractor: ContractorDetail; onSaved: () => Promise<void> | void }) {
  const { authedFetch } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(() => toForm(contractor));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setForm(toForm(contractor));
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractor.id}`, {
        method: 'PATCH',
        body: {
          bankName: form.bankName.trim() || null,
          bankAccountName: form.bankAccountName.trim() || null,
          bankAccountNumber: form.bankAccountNumber.trim() || null,
          preferredPaymentMethod: form.preferredPaymentMethod.trim() || null,
          paymentTerms: form.paymentTerms.trim() || null,
          creditTerms: form.creditTerms.trim() || null,
          withholdingTaxInfo: form.withholdingTaxInfo.trim() || null,
        },
      });
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save financial details.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <p>
          This app has no role-based permissions yet, so this tab is visible to any signed-in user, the same as every other page —
          treat this as internal reference data only until real access control exists.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Financial information</h2>
          {editing ? (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400">
                <X size={13} />
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
              >
                <Check size={13} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Bank name</label>
              <input className={inputClass} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Account name</label>
              <input className={inputClass} value={form.bankAccountName} onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Account number</label>
              <input className={inputClass} value={form.bankAccountNumber} onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Preferred payment method</label>
              <input
                className={inputClass}
                value={form.preferredPaymentMethod}
                onChange={(e) => setForm({ ...form, preferredPaymentMethod: e.target.value })}
                placeholder="e.g. EFT, Cheque"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Payment terms</label>
              <input className={inputClass} value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} placeholder="e.g. Net 30" />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Credit terms</label>
              <input className={inputClass} value={form.creditTerms} onChange={(e) => setForm({ ...form, creditTerms: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-400 dark:text-slate-500">Withholding tax information</label>
              <input className={inputClass} value={form.withholdingTaxInfo} onChange={(e) => setForm({ ...form, withholdingTaxInfo: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Bank name" value={contractor.bankName ?? ''} />
            <Field label="Account name" value={contractor.bankAccountName ?? ''} />
            <Field label="Account number" value={contractor.bankAccountNumber ?? ''} />
            <Field label="Preferred payment method" value={contractor.preferredPaymentMethod ?? ''} />
            <Field label="Payment terms" value={contractor.paymentTerms ?? ''} />
            <Field label="Credit terms" value={contractor.creditTerms ?? ''} />
            <Field label="Withholding tax information" value={contractor.withholdingTaxInfo ?? ''} />
            <Field label="Tax / VAT number" value={contractor.taxVatNumber ?? ''} />
          </div>
        )}
      </div>

      <PaymentsSection contractor={contractor} />
    </div>
  );
}
