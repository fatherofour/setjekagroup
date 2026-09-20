'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X, Truck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import type { Contractor } from '@/lib/contractors';

type PoStatus = 'DRAFT' | 'APPROVED' | 'ISSUED' | 'CANCELLED';
type DeliveryStatus = 'PENDING' | 'PARTIAL' | 'DELIVERED' | 'DELAYED' | 'REJECTED';

interface PurchaseOrder {
  id: string;
  poNumber: string;
  costCode: string | null;
  scopeDescription: string | null;
  value: number;
  currency: string;
  status: PoStatus;
  contractor: { id: string; name: string };
}

interface StatusHistoryEntry {
  id: string;
  previousStatus: string;
  newStatus: string;
  comment: string | null;
  changedAt: string;
  changedBy: { fullName: string };
}

interface Delivery {
  id: string;
  description: string;
  quantityOrdered: number;
  quantityDelivered: number;
  expectedDate: string | null;
  deliveredDate: string | null;
  status: DeliveryStatus;
}

const STATUS_DOT: Record<PoStatus, string> = {
  DRAFT: 'bg-slate-400',
  APPROVED: 'bg-blue-500',
  ISSUED: 'bg-emerald-500',
  CANCELLED: 'bg-red-500',
};

const DELIVERY_DOT: Record<DeliveryStatus, string> = {
  PENDING: 'bg-slate-400',
  PARTIAL: 'bg-amber-500',
  DELIVERED: 'bg-emerald-500',
  DELAYED: 'bg-orange-500',
  REJECTED: 'bg-red-500',
};

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function DeliveriesSection({ projectId, poId, isExternal }: { projectId: string; poId: string; isExternal: boolean }) {
  const { authedFetch } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [form, setForm] = useState({ description: '', quantityOrdered: '', expectedDate: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    authedFetch<Delivery[]>(`/projects/${projectId}/purchase-orders/${poId}/deliveries`).then(setDeliveries).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.description.trim() || !form.quantityOrdered) return;
    setSaving(true);
    try {
      await authedFetch(`/projects/${projectId}/purchase-orders/${poId}/deliveries`, {
        method: 'POST',
        body: { description: form.description.trim(), quantityOrdered: Number(form.quantityOrdered), expectedDate: form.expectedDate || undefined },
      });
      setForm({ description: '', quantityOrdered: '', expectedDate: '' });
      load();
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: DeliveryStatus, quantityDelivered?: number) {
    await authedFetch(`/projects/${projectId}/purchase-orders/${poId}/deliveries/${id}`, {
      method: 'PATCH',
      body: { status, quantityDelivered, deliveredDate: status === 'DELIVERED' ? new Date().toISOString().slice(0, 10) : undefined },
    });
    load();
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        <Truck size={12} />
        Deliveries
      </h4>
      {deliveries === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : deliveries.length === 0 ? (
        <p className="mb-2 text-sm text-slate-400 dark:text-slate-500">No deliveries logged yet.</p>
      ) : (
        <ul className="mb-2 space-y-1.5">
          {deliveries.map((d) => (
            <li key={d.id} className="rounded-md bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-800/50">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                  <span className={`h-1.5 w-1.5 rounded-full ${DELIVERY_DOT[d.status]}`} />
                  {d.description}
                </span>
                <span className="text-slate-400">{d.quantityDelivered}/{d.quantityOrdered}</span>
              </div>
              {!isExternal && (
                <div className="flex flex-wrap gap-1">
                  <button onClick={() => setStatus(d.id, 'PARTIAL', d.quantityOrdered / 2)} className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300">
                    Partial
                  </button>
                  <button onClick={() => setStatus(d.id, 'DELIVERED', d.quantityOrdered)} className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                    Delivered
                  </button>
                  <button onClick={() => setStatus(d.id, 'DELAYED')} className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300">
                    Delayed
                  </button>
                  <button onClick={() => setStatus(d.id, 'REJECTED')} className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300">
                    Rejected
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!isExternal && (
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input placeholder="Item description" className={`${inputClass} flex-1`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input type="number" placeholder="Qty" className={`${inputClass} w-20`} value={form.quantityOrdered} onChange={(e) => setForm({ ...form, quantityOrdered: e.target.value })} />
          <input type="date" className={inputClass} value={form.expectedDate} onChange={(e) => setForm({ ...form, expectedDate: e.target.value })} />
          <button type="submit" disabled={saving} className="flex h-8 items-center gap-1 rounded-md bg-slate-100 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">
            <Plus size={12} />
            Log delivery
          </button>
        </form>
      )}
    </div>
  );
}

function PoDetailPanel({
  projectId,
  po,
  isExternal,
  onClose,
  onChanged,
}: {
  projectId: string;
  po: PurchaseOrder;
  isExternal: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [history, setHistory] = useState<StatusHistoryEntry[] | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadHistory = () => {
    authedFetch<StatusHistoryEntry[]>(`/projects/${projectId}/purchase-orders/${po.id}/history`).then(setHistory).catch(() => {});
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.id]);

  async function changeStatus(status: PoStatus) {
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/purchase-orders/${po.id}/status`, { method: 'PATCH', body: { status, comment: comment.trim() || undefined } });
      setComment('');
      loadHistory();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change status.');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{po.poNumber}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <p className="text-sm text-slate-700 dark:text-slate-200">{po.contractor.name}</p>
        {po.scopeDescription && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{po.scopeDescription}</p>}
        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {po.currency} {po.value.toLocaleString()}
        </p>
        {po.costCode && <p className="text-xs text-slate-400 dark:text-slate-500">Cost code: {po.costCode}</p>}

        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[po.status]}`} />
          <span className="text-xs text-slate-500 dark:text-slate-400">{po.status}</span>
        </div>

        {!isExternal && po.status !== 'CANCELLED' && po.status !== 'ISSUED' && (
          <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <input
              className={`${inputClass} mb-2 w-full`}
              placeholder="Comment for this status change (optional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {po.status === 'DRAFT' && (
                <button onClick={() => changeStatus('APPROVED')} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                  Approve
                </button>
              )}
              {po.status === 'APPROVED' && (
                <button onClick={() => changeStatus('ISSUED')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">
                  Issue
                </button>
              )}
              <button onClick={() => changeStatus('CANCELLED')} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">
                Cancel
              </button>
            </div>
          </div>
        )}

        {history && history.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2 dark:border-slate-800">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
            <ul className="space-y-1">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-slate-500 dark:text-slate-400">
                  {h.previousStatus} → {h.newStatus} by {h.changedBy.fullName} · {new Date(h.changedAt).toLocaleString()}
                  {h.comment && <span className="block text-slate-600 dark:text-slate-300">{h.comment}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DeliveriesSection projectId={projectId} poId={po.id} isExternal={isExternal} />
      </div>
    </div>
  );
}

export function PurchaseOrdersPanel({ projectId, isExternal }: { projectId: string; isExternal: boolean }) {
  const { authedFetch } = useAuth();
  const [pos, setPos] = useState<PurchaseOrder[] | null>(null);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ contractorId: '', value: '', currency: 'ZAR', costCode: '', scopeDescription: '' });
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    authedFetch<PurchaseOrder[]>(`/projects/${projectId}/purchase-orders`)
      .then(setPos)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load purchase orders.'));
  };

  useEffect(() => {
    load();
    if (!isExternal) authedFetch<Contractor[]>('/contractors').then(setContractors).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!form.contractorId || !form.value) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/purchase-orders`, {
        method: 'POST',
        body: {
          contractorId: form.contractorId,
          value: Number(form.value),
          currency: form.currency,
          costCode: form.costCode || undefined,
          scopeDescription: form.scopeDescription || undefined,
        },
      });
      setForm({ contractorId: '', value: '', currency: 'ZAR', costCode: '', scopeDescription: '' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create purchase order.');
    } finally {
      setSaving(false);
    }
  }

  const openPo = pos?.find((p) => p.id === openId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Purchase Orders</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {pos === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : pos.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No purchase orders yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {pos.map((p) => (
            <li key={p.id}>
              <button onClick={() => setOpenId(p.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[p.status]}`} />
                <span className="shrink-0 text-xs text-slate-400">{p.poNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{p.contractor.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  {p.currency} {p.value.toLocaleString()}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{p.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isExternal && (
        <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            <Select
              value={form.contractorId}
              onChange={(v) => setForm({ ...form, contractorId: v })}
              className={`${inputClass} flex-1`}
              options={[{ value: '', label: 'Select vendor…' }, ...contractors.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <input type="number" placeholder="Value" className={`${inputClass} w-28`} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            <Select value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} options={[{ value: 'ZAR', label: 'ZAR' }, { value: 'USD', label: 'USD' }]} className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-2">
            <input placeholder="Cost code (optional)" className={`${inputClass} w-40`} value={form.costCode} onChange={(e) => setForm({ ...form, costCode: e.target.value })} />
            <input placeholder="Scope (optional)" className={`${inputClass} flex-1`} value={form.scopeDescription} onChange={(e) => setForm({ ...form, scopeDescription: e.target.value })} />
            <button
              type="submit"
              disabled={saving || !form.contractorId || !form.value}
              className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              <Plus size={13} />
              Create PO
            </button>
          </div>
        </form>
      )}

      {openPo && <PoDetailPanel projectId={projectId} po={openPo} isExternal={isExternal} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
