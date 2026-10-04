'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { formatRate } from '@/lib/commercial';

type Status = 'RECEIVED' | 'APPROVED' | 'PAID' | 'REJECTED';

interface Order {
  id: string;
  poNumber: string;
  value: number;
  currency: string;
  status: string;
  contractor: { name: string };
  invoiced: number;
  paid: number;
  remainingToInvoice: number;
  outstanding: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: number;
  status: Status;
  paidAt: string | null;
  paymentReference: string | null;
  rejectionReason: string | null;
  notes: string | null;
  purchaseOrder: { id: string; poNumber: string; currency: string; contractor: { name: string } };
  recordedBy: { fullName: string };
  approvedBy: { fullName: string } | null;
}

const TONE: Record<Status, string> = {
  RECEIVED: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  APPROVED: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};
const LABEL: Record<Status, string> = { RECEIVED: 'Received', APPROVED: 'Approved for payment', PAID: 'Paid', REJECTED: 'Rejected' };

/** Supplier invoices against purchase orders (Meeting 002, 2.8): invoiced
 * and paid tracked against each order's value so nobody is over- or
 * underpaid, and the balance outstanding is always visible. */
export function InvoicesPanel({ projectId, readOnly, onChanged }: { projectId: string; readOnly: boolean; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [data, setData] = useState<{ invoices: Invoice[]; orders: Order[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ purchaseOrderId: '', invoiceNumber: '', invoiceDate: new Date().toISOString().slice(0, 10), amount: '', notes: '' });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const base = `/projects/${projectId}/commercial/invoices`;

  const load = () =>
    authedFetch<{ invoices: Invoice[]; orders: Order[] }>(base)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load invoices.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed.');
      return false;
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => authedFetch(base, { method: 'POST', body: { ...form, amount: Number(form.amount), invoiceNumber: form.invoiceNumber.trim(), notes: form.notes.trim() || undefined } }));
    if (ok) {
      setAdding(false);
      setForm({ ...form, invoiceNumber: '', amount: '', notes: '' });
    }
  }

  if (error && !data) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!data) return <p className="text-sm text-slate-400">Loading…</p>;

  const order = data.orders.find((o) => o.id === form.purchaseOrderId);
  const val = (k: string) => inputs[k] ?? '';

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Purchase orders — invoiced and paid</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">An invoice that would take an order past its value is refused, so no supplier is overpaid. Invoices are approved by someone other than the person who recorded them.</p>
          </div>
          {!readOnly && !adding && (
            <button type="button" disabled={!data.orders.length} onClick={() => setAdding(true)} className={secondaryButton}>
              <Plus size={14} />
              Record invoice
            </button>
          )}
        </div>

        {adding && (
          <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-5 dark:bg-slate-800/40">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="inv-po">
                Purchase order
              </label>
              <Select id="inv-po" value={form.purchaseOrderId} onChange={(v) => setForm({ ...form, purchaseOrderId: v })} options={[{ value: '', label: 'Choose…' }, ...data.orders.map((o) => ({ value: o.id, label: `${o.poNumber} · ${o.contractor.name}` }))]} className={inputClass} />
              {order && <p className="mt-1 text-xs text-slate-500">{formatRate(order.remainingToInvoice, order.currency)} left to invoice</p>}
            </div>
            <div>
              <label className={labelClass} htmlFor="inv-no">
                Invoice number
              </label>
              <input id="inv-no" className={inputClass} value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="inv-date">
                Invoice date
              </label>
              <input id="inv-date" type="date" className={inputClass} value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="inv-amt">
                Amount {order ? `(${order.currency})` : ''}
              </label>
              <input id="inv-amt" type="number" min={0} step="any" className={`${inputClass} text-right`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="flex gap-2 sm:col-span-5">
              <button type="submit" disabled={!form.purchaseOrderId || !form.invoiceNumber.trim() || !form.amount} className={primaryButton}>
                Record invoice
              </button>
              <button type="button" onClick={() => setAdding(false)} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {data.orders.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No approved or issued purchase orders yet. Orders are raised on the Procurement tab.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="py-2 pr-2 font-medium">Order</th>
                  <th className="py-2 pr-2 text-right font-medium">Value</th>
                  <th className="py-2 pr-2 text-right font-medium">Invoiced</th>
                  <th className="py-2 pr-2 text-right font-medium">Paid</th>
                  <th className="py-2 pr-2 text-right font-medium">Owed now</th>
                  <th className="py-2 text-right font-medium">Left to invoice</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-2">
                      <span className="font-mono text-xs text-slate-500">{o.poNumber}</span> <span className="text-slate-800 dark:text-slate-100">{o.contractor.name}</span>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatRate(o.value, o.currency)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatRate(o.invoiced)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatRate(o.paid)}</td>
                    <td className={`py-2 pr-2 text-right tabular-nums ${o.outstanding > 0 ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}>{formatRate(o.outstanding)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500">{formatRate(o.remainingToInvoice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Invoices</h2>
        {data.invoices.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No supplier invoices recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {data.invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <div className="min-w-[200px] flex-1">
                  <p className="text-slate-800 dark:text-slate-100">
                    <span className="font-medium">{i.invoiceNumber}</span> · {i.purchaseOrder.contractor.name} <span className="font-mono text-xs text-slate-400">{i.purchaseOrder.poNumber}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(i.invoiceDate).toLocaleDateString()} · recorded by {i.recordedBy.fullName}
                    {i.approvedBy && ` · approved by ${i.approvedBy.fullName}`}
                    {i.paidAt && ` · paid ${new Date(i.paidAt).toLocaleDateString()} (${i.paymentReference})`}
                    {i.rejectionReason && ` · rejected: ${i.rejectionReason}`}
                  </p>
                </div>
                <span className="tabular-nums">{formatRate(i.amount, i.purchaseOrder.currency)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[i.status]}`}>{LABEL[i.status]}</span>
                {!readOnly && i.status === 'RECEIVED' && (
                  <>
                    <button type="button" onClick={() => run(() => authedFetch(`${base}/${i.id}/approve`, { method: 'POST' }))} className={secondaryButton}>
                      Approve
                    </button>
                    <input aria-label="Rejection reason" className={`${inputClass} h-8 w-40`} placeholder="Reason to reject" value={val(`r:${i.id}`)} onChange={(e) => setInputs({ ...inputs, [`r:${i.id}`]: e.target.value })} />
                    <button type="button" disabled={!val(`r:${i.id}`).trim()} onClick={() => run(() => authedFetch(`${base}/${i.id}/reject`, { method: 'POST', body: { reason: val(`r:${i.id}`) } }))} className={secondaryButton}>
                      Reject
                    </button>
                  </>
                )}
                {!readOnly && i.status === 'APPROVED' && (
                  <>
                    <input aria-label="Payment reference" className={`${inputClass} h-8 w-44`} placeholder="Payment reference, e.g. EFT no." value={val(`p:${i.id}`)} onChange={(e) => setInputs({ ...inputs, [`p:${i.id}`]: e.target.value })} />
                    <button type="button" disabled={!val(`p:${i.id}`).trim()} onClick={() => run(() => authedFetch(`${base}/${i.id}/pay`, { method: 'POST', body: { paymentReference: val(`p:${i.id}`) } }))} className={primaryButton}>
                      Mark paid
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
