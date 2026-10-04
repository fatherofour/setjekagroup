'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CURRENCY_OPTIONS } from '@/lib/projectMeta';
import { Award, Check, Database, Plus, Send, Trash2, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import type { Contractor } from '@/lib/contractors';
import { formatQty, formatRate, type CostRegion, type CostResource } from '@/lib/commercial';
import { SearchPicker } from '@/components/costs/SearchPicker';

type RfqStatus = 'DRAFT' | 'ISSUED' | 'CLOSED' | 'AWARDED' | 'CANCELLED';

interface RfqInvitation {
  id: string;
  contractor: { id: string; name: string; tradeType: string | null };
}

interface QuoteSummary {
  id: string;
  contractorId: string;
  price: number;
  currency: string;
  status: string;
  items?: { rfqItemId: string; unitRate: number }[];
}

interface RfqItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  resource: { id: string; code: string; name: string; unit: string } | null;
}

interface Rfq {
  id: string;
  rfqNumber: string;
  title: string;
  scopeDescription: string | null;
  dueDate: string | null;
  status: RfqStatus;
  invitations: RfqInvitation[];
  quotes: QuoteSummary[];
  items?: RfqItem[];
  costRegion?: { id: string; name: string; currency: string } | null;
  awardedQuoteId?: string | null;
  awardedAt?: string | null;
  pricesUpdatedAt?: string | null;
}

interface Quote extends QuoteSummary {
  leadTimeDays: number | null;
  warrantyTerms: string | null;
  commercialTerms: string | null;
  technicalProposal: string | null;
  evaluationScores: { criterion: string; weight: number; score: number }[] | null;
  evaluationTotal: number | null;
  contractor: { id: string; name: string; tradeType: string | null };
}

interface PriceUpdate {
  region: { name: string; currency: string };
  updated: number;
  skipped: string[];
}

const STATUS_DOT: Record<RfqStatus, string> = {
  DRAFT: 'bg-slate-400',
  ISSUED: 'bg-blue-500',
  CLOSED: 'bg-slate-500',
  AWARDED: 'bg-emerald-500',
  CANCELLED: 'bg-red-500',
};

const STATUS_LABEL: Record<RfqStatus, string> = { DRAFT: 'Draft', ISSUED: 'Issued', CLOSED: 'Closed', AWARDED: 'Awarded', CANCELLED: 'Cancelled' };

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const DEFAULT_CRITERIA = ['Price', 'Technical compliance', 'Programme', 'Quality'];

function QuoteCard({
  projectId,
  rfq,
  quote,
  isExternal,
  awarded,
  canAward,
  onAward,
  onChanged,
}: {
  projectId: string;
  rfq: Rfq;
  quote: Quote;
  isExternal: boolean;
  awarded: boolean;
  canAward: boolean;
  onAward: (q: Quote) => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [scores, setScores] = useState<{ criterion: string; weight: number; score: number }[]>(
    quote.evaluationScores && quote.evaluationScores.length > 0
      ? quote.evaluationScores
      : DEFAULT_CRITERIA.map((criterion) => ({ criterion, weight: 25, score: 0 })),
  );
  const [saving, setSaving] = useState(false);
  const items = rfq.items ?? [];

  async function saveEvaluation() {
    setSaving(true);
    try {
      await authedFetch(`/projects/${projectId}/rfqs/${rfq.id}/quotes/${quote.id}/evaluate`, { method: 'PATCH', body: { scores } });
      onChanged();
    } catch {
      // Error surfaces via the parent's reload/error banner on next load.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`rounded-md border p-3 ${awarded ? 'border-emerald-400 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">
          {awarded && <Award size={14} className="text-emerald-600" />}
          {quote.contractor.name}
          {quote.status === 'WITHDRAWN' && <span className="text-xs font-normal text-slate-400">(withdrawn)</span>}
        </span>
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {quote.currency} {quote.price.toLocaleString()}
        </span>
      </div>
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
        {quote.leadTimeDays != null && `Lead time: ${quote.leadTimeDays}d · `}
        {quote.warrantyTerms && `Warranty: ${quote.warrantyTerms}`}
      </p>

      {items.length > 0 && quote.items && quote.items.length > 0 && (
        <table className="mb-2 w-full text-xs">
          <tbody>
            {items.map((it) => {
              const r = quote.items!.find((x) => x.rfqItemId === it.id);
              return (
                <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1 pr-2 text-slate-600 dark:text-slate-300">{it.description}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-slate-400">
                    {formatQty(it.quantity)} {it.unit}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">@ {r ? formatRate(r.unitRate) : '—'}</td>
                  <td className="py-1 text-right tabular-nums text-slate-500">{r ? formatRate(r.unitRate * it.quantity) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!isExternal && (
        <div className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
          {scores.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 truncate text-slate-500 dark:text-slate-400">{s.criterion}</span>
              <input
                type="number"
                aria-label={`${s.criterion} weight`}
                className={`${inputClass} h-6 w-16`}
                value={s.weight}
                title="Weight %"
                onChange={(e) => setScores(scores.map((x, idx) => (idx === i ? { ...x, weight: Number(e.target.value) } : x)))}
              />
              <input
                type="number"
                aria-label={`${s.criterion} score`}
                min={0}
                max={10}
                className={`${inputClass} h-6 w-16`}
                value={s.score}
                title="Score /10"
                onChange={(e) => setScores(scores.map((x, idx) => (idx === i ? { ...x, score: Number(e.target.value) } : x)))}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {quote.evaluationTotal != null ? `Weighted total: ${quote.evaluationTotal.toFixed(2)}` : 'Not yet evaluated'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={saveEvaluation}
                disabled={saving}
                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                Save evaluation
              </button>
              {canAward && quote.status === 'SUBMITTED' && (
                <button onClick={() => onAward(quote)} className="flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800">
                  <Award size={12} />
                  Award
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RfqDetailPanel({
  projectId,
  rfq,
  contractors,
  isExternal,
  onClose,
  onChanged,
}: {
  projectId: string;
  rfq: Rfq;
  contractors: Contractor[];
  isExternal: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const base = `/projects/${projectId}/rfqs/${rfq.id}`;
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [regions, setRegions] = useState<CostRegion[]>([]);
  const [resources, setResources] = useState<CostResource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [priceUpdate, setPriceUpdate] = useState<PriceUpdate | null>(null);
  const [inviteContractorId, setInviteContractorId] = useState('');
  const [itemForm, setItemForm] = useState({ resourceId: null as string | null, description: '', unit: '', quantity: '' });
  const [quoteForm, setQuoteForm] = useState({ contractorId: '', price: '', currency: '', leadTimeDays: '', warrantyTerms: '' });
  // Quotes default to the currency of the RFQ's cost region until changed.
  const quoteCurrency = quoteForm.currency || rfq.costRegion?.currency || 'ZAR';
  const [rates, setRates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const items = useMemo(() => rfq.items ?? [], [rfq.items]);

  const loadQuotes = () => {
    authedFetch<Quote[]>(`${base}/quotes`)
      .then(setQuotes)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quotes.'));
  };

  useEffect(() => {
    loadQuotes();
    if (!isExternal) authedFetch<CostRegion[]>('/cost-regions').then((r) => setRegions(r.filter((x) => x.isActive))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq.id]);

  useEffect(() => {
    if (isExternal) return;
    authedFetch<CostResource[]>(`/cost-resources${rfq.costRegion ? `?regionId=${rfq.costRegion.id}` : ''}`).then(setResources).catch(() => {});
  }, [authedFetch, isExternal, rfq.costRegion]);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        authedFetch(`${base}/items`, {
          method: 'POST',
          body: {
            resourceId: itemForm.resourceId ?? undefined,
            description: itemForm.description.trim() || undefined,
            unit: itemForm.resourceId ? undefined : itemForm.unit.trim(),
            quantity: Number(itemForm.quantity),
          },
        }),
      'Failed to add the item.',
    );
    if (ok) setItemForm({ resourceId: null, description: '', unit: '', quantity: '' });
  }

  async function award(q: Quote) {
    const note = rfq.costRegion && items.length ? ` Its item rates will update the ${rfq.costRegion.name} price sheet.` : '';
    if (!confirm(`Award ${rfq.rfqNumber} to ${q.contractor.name} at ${q.currency} ${q.price.toLocaleString()}?${note}`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch<{ priceUpdate: PriceUpdate | null }>(`${base}/award`, { method: 'POST', body: { quoteId: q.id } });
      setPriceUpdate(res.priceUpdate);
      onChanged();
      loadQuotes();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to award.');
    } finally {
      setSaving(false);
    }
  }

  async function reapply() {
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch<{ priceUpdate: PriceUpdate }>(`${base}/update-prices`, { method: 'POST' });
      setPriceUpdate(res.priceUpdate);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update the price sheet.');
    } finally {
      setSaving(false);
    }
  }

  async function submitQuote(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        authedFetch(`${base}/quotes`, {
          method: 'POST',
          body: {
            contractorId: isExternal ? undefined : quoteForm.contractorId,
            price: items.length ? undefined : Number(quoteForm.price),
            items: items.length ? items.map((it) => ({ rfqItemId: it.id, unitRate: Number(rates[it.id]) })) : undefined,
            currency: quoteCurrency,
            leadTimeDays: quoteForm.leadTimeDays ? Number(quoteForm.leadTimeDays) : undefined,
            warrantyTerms: quoteForm.warrantyTerms || undefined,
          },
        }),
      'Failed to submit quote.',
    );
    if (ok) {
      setQuoteForm({ ...quoteForm, contractorId: '', price: '', leadTimeDays: '', warrantyTerms: '' });
      setRates({});
      loadQuotes();
    }
  }

  const invitedIds = new Set(rfq.invitations.map((i) => i.contractor.id));
  const quotedIds = new Set((quotes ?? []).filter((q) => q.status === 'SUBMITTED').map((q) => q.contractorId));
  const itemsTotal = items.reduce((s, it) => s + (Number(rates[it.id]) || 0) * it.quantity, 0);
  const ratesComplete = items.every((it) => rates[it.id] !== undefined && rates[it.id] !== '');
  const canQuote = rfq.status === 'ISSUED' && (isExternal || rfq.invitations.length > 0);
  const steps: [string, boolean][] = [
    ['Draft', true],
    ['Issued', rfq.status !== 'DRAFT'],
    ['Quotes in', (quotes?.length ?? 0) > 0],
    ['Awarded', rfq.status === 'AWARDED'],
    ['Price sheet updated', Boolean(rfq.pricesUpdatedAt)],
  ];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rfq.rfqNumber}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {priceUpdate && (
          <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
            <p className="flex items-center gap-1.5 font-medium">
              <Database size={13} />
              {priceUpdate.updated} price{priceUpdate.updated === 1 ? '' : 's'} updated in the {priceUpdate.region.name} price sheet from the awarded quote.
            </p>
            {priceUpdate.skipped.length > 0 && <p className="mt-1 text-amber-800 dark:text-amber-300">Not updated: {priceUpdate.skipped.join('; ')}.</p>}
          </div>
        )}

        <h3 className="text-base font-medium text-slate-900 dark:text-slate-100">{rfq.title}</h3>
        {rfq.scopeDescription && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{rfq.scopeDescription}</p>}

        {!isExternal && (
          <ol className="mt-3 flex flex-wrap items-center gap-1 text-[11px]">
            {steps.map(([label, done], i) => (
              <li key={label} className="flex items-center gap-1">
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                  {done && <Check size={10} />}
                  {label}
                </span>
                {i < steps.length - 1 && <span className="text-slate-300">→</span>}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[rfq.status]}`} />
          <span className="text-xs text-slate-500 dark:text-slate-400">{STATUS_LABEL[rfq.status]}</span>
          {!isExternal && rfq.status === 'DRAFT' && (
            <button onClick={() => run(() => authedFetch(`${base}/issue`, { method: 'PATCH' }), 'Failed to issue RFQ.')} disabled={saving} className="ml-2 flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              <Send size={12} />
              Issue RFQ
            </button>
          )}
        </div>

        {!isExternal && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cost region</h4>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Once the RFQ is awarded, the winning item rates update this region&apos;s price sheet in the cost database.</p>
            {rfq.status === 'AWARDED' ? (
              <p className="text-sm text-slate-700 dark:text-slate-200">{rfq.costRegion ? `${rfq.costRegion.name} (${rfq.costRegion.currency})` : 'None — the price sheet was not updated'}</p>
            ) : (
              <Select
                aria-label="Cost region"
                value={rfq.costRegion?.id ?? ''}
                onChange={(v) => run(() => authedFetch(base, { method: 'PATCH', body: { costRegionId: v || null } }), 'Failed to set the region.')}
                options={[{ value: '', label: 'No region — do not update a price sheet' }, ...regions.map((r) => ({ value: r.id, label: `${r.name} (${r.currency})` }))]}
                className={`${inputClass} w-full`}
              />
            )}
            {rfq.status === 'AWARDED' && rfq.costRegion && items.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {rfq.pricesUpdatedAt ? `Price sheet updated ${new Date(rfq.pricesUpdatedAt).toLocaleString()}.` : 'Price sheet not updated yet.'}
                <button type="button" disabled={saving} onClick={reapply} className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">
                  Re-apply awarded rates
                </button>
              </div>
            )}
          </div>
        )}

        {(items.length > 0 || (!isExternal && rfq.status === 'DRAFT')) && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Items to price</h4>
            {!isExternal && rfq.status === 'DRAFT' && (
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Vendors quote a unit rate for each item. Pick items from the cost database so the awarded rates can update its prices.</p>
            )}
            {items.length > 0 && (
              <table className="mb-2 w-full text-sm">
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">
                        {it.description}
                        {it.resource && !isExternal && (
                          <span className="ml-1.5 rounded bg-emerald-50 px-1 text-[10px] text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" title="Linked to the cost database">
                            {it.resource.code}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">
                        {formatQty(it.quantity)} {it.unit}
                      </td>
                      <td className="w-8 py-1.5 text-right">
                        {!isExternal && rfq.status === 'DRAFT' && (
                          <button type="button" aria-label={`Remove ${it.description}`} onClick={() => run(() => authedFetch(`${base}/items/${it.id}`, { method: 'DELETE' }), 'Failed to remove the item.')} className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!isExternal && rfq.status === 'DRAFT' && (
              <form onSubmit={addItem} className="flex flex-wrap items-center gap-2">
                <SearchPicker
                  aria-label="Item from the cost database"
                  className="min-w-[220px] flex-1"
                  options={resources.map((r) => ({ id: r.id, label: `${r.name} (${r.unit})`, hint: r.code }))}
                  value={itemForm.resourceId}
                  placeholder="From the cost database…"
                  onChange={(id) => setItemForm({ ...itemForm, resourceId: id })}
                />
                {!itemForm.resourceId && (
                  <>
                    <input aria-label="Item description" placeholder="…or describe it" className={`${inputClass} w-40`} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
                    <input aria-label="Unit" placeholder="Unit" className={`${inputClass} w-16`} value={itemForm.unit} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })} />
                  </>
                )}
                <input aria-label="Quantity" type="number" min={0} step="any" placeholder="Qty" className={`${inputClass} w-24 text-right`} value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
                <button
                  type="submit"
                  disabled={saving || !itemForm.quantity || (!itemForm.resourceId && (!itemForm.description.trim() || !itemForm.unit.trim()))}
                  className="flex h-8 items-center gap-1 rounded-md bg-slate-100 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Plus size={13} />
                  Add item
                </button>
              </form>
            )}
          </div>
        )}

        {!isExternal && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Invited vendors</h4>
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {rfq.invitations.map((inv) => (
                <li key={inv.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {inv.contractor.name}
                </li>
              ))}
            </ul>
            {rfq.status !== 'AWARDED' && (
              <div className="flex items-center gap-2">
                <Select
                  value={inviteContractorId}
                  onChange={setInviteContractorId}
                  className={`${inputClass} flex-1`}
                  options={[
                    { value: '', label: 'Select a vendor to invite…' },
                    ...contractors.filter((c) => !invitedIds.has(c.id)).map((c) => ({ value: c.id, label: c.name })),
                  ]}
                />
                <button
                  onClick={async () => {
                    if (!inviteContractorId) return;
                    if (await run(() => authedFetch(`${base}/invitations`, { method: 'POST', body: { contractorId: inviteContractorId } }), 'Failed to invite vendor.')) setInviteContractorId('');
                  }}
                  disabled={saving || !inviteContractorId}
                  className="flex h-8 items-center gap-1 rounded-md bg-slate-100 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
                >
                  <UserPlus size={13} />
                  Invite
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Quotes {isExternal ? '(yours)' : '— side by side'}
          </h4>
          {!isExternal && (rfq.status === 'ISSUED' || rfq.status === 'CLOSED') && (quotes?.length ?? 0) > 0 && (
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Evaluate the quotes, then award one. Award is the step that updates the cost database.</p>
          )}
          {quotes === null ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : quotes.length === 0 ? (
            <p className="mb-2 text-sm text-slate-400 dark:text-slate-500">No quotes submitted yet.</p>
          ) : (
            <div className="mb-3 space-y-2">
              {quotes.map((q) => (
                <QuoteCard
                  key={q.id}
                  projectId={projectId}
                  rfq={rfq}
                  quote={q}
                  isExternal={isExternal}
                  awarded={rfq.awardedQuoteId === q.id}
                  canAward={!isExternal && (rfq.status === 'ISSUED' || rfq.status === 'CLOSED')}
                  onAward={award}
                  onChanged={loadQuotes}
                />
              ))}
            </div>
          )}

          {canQuote && (
            <form onSubmit={submitQuote} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{isExternal ? 'Submit your quote' : 'Record a quote received by email or on paper'}</p>
              {!isExternal && (
                <Select
                  aria-label="Vendor"
                  value={quoteForm.contractorId}
                  onChange={(v) => setQuoteForm({ ...quoteForm, contractorId: v })}
                  options={[{ value: '', label: 'Which vendor?' }, ...rfq.invitations.filter((i) => !quotedIds.has(i.contractor.id)).map((i) => ({ value: i.contractor.id, label: i.contractor.name }))]}
                  className={`${inputClass} w-full`}
                />
              )}
              {items.length > 0 ? (
                <table className="w-full text-sm">
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-1 pr-2 text-slate-600 dark:text-slate-300">{it.description}</td>
                        <td className="py-1 pr-2 text-right text-xs tabular-nums text-slate-400">
                          {formatQty(it.quantity)} {it.unit}
                        </td>
                        <td className="w-32 py-1">
                          <input
                            aria-label={`Unit rate for ${it.description}`}
                            type="number"
                            min={0}
                            step="any"
                            placeholder={`Rate per ${it.unit}`}
                            className={`${inputClass} w-full text-right`}
                            value={rates[it.id] ?? ''}
                            onChange={(e) => setRates({ ...rates, [it.id]: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={2} className="pt-1 text-right text-xs font-medium text-slate-600 dark:text-slate-300">
                        Total
                      </td>
                      <td className="pt-1 text-right text-sm font-semibold tabular-nums">{formatRate(itemsTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <input type="number" aria-label="Price" placeholder="Price" className={`${inputClass} w-full`} value={quoteForm.price} onChange={(e) => setQuoteForm({ ...quoteForm, price: e.target.value })} />
              )}
              <div className="flex gap-2">
                <Select aria-label="Currency" value={quoteCurrency} onChange={(v) => setQuoteForm({ ...quoteForm, currency: v })} options={CURRENCY_OPTIONS} className={inputClass} />
                <input type="number" aria-label="Lead time (days)" placeholder="Lead time (days)" className={`${inputClass} flex-1`} value={quoteForm.leadTimeDays} onChange={(e) => setQuoteForm({ ...quoteForm, leadTimeDays: e.target.value })} />
                <input aria-label="Warranty terms" placeholder="Warranty terms" className={`${inputClass} flex-1`} value={quoteForm.warrantyTerms} onChange={(e) => setQuoteForm({ ...quoteForm, warrantyTerms: e.target.value })} />
              </div>
              <button
                type="submit"
                disabled={saving || (items.length ? !ratesComplete : !quoteForm.price) || (!isExternal && !quoteForm.contractorId)}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {isExternal ? 'Submit quote' : 'Record quote'}
              </button>
            </form>
          )}
        </div>
        {!isExternal && rfq.status === 'AWARDED' && (
          <p className="mt-4 text-xs text-slate-500">
            Next: raise the purchase order for the awarded quote below, then track its deliveries and invoices.{' '}
            {rfq.costRegion && (
              <Link href="/cost-database?tab=prices" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                View the {rfq.costRegion.name} price sheet
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export function RfqsPanel({ projectId, isExternal }: { projectId: string; isExternal: boolean }) {
  const { authedFetch } = useAuth();
  const [rfqs, setRfqs] = useState<Rfq[] | null>(null);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    authedFetch<Rfq[]>(`/projects/${projectId}/rfqs`)
      .then(setRfqs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load RFQs.'));
  };

  useEffect(() => {
    load();
    if (!isExternal) authedFetch<Contractor[]>('/contractors').then(setContractors).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await authedFetch<Rfq>(`/projects/${projectId}/rfqs`, { method: 'POST', body: { title: title.trim() } });
      setTitle('');
      load();
      setOpenId(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create RFQ.');
    } finally {
      setSaving(false);
    }
  }

  const openRfq = rfqs?.find((r) => r.id === openId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Requests for Quotation</h2>
      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {rfqs === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rfqs.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No RFQs yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {rfqs.map((r) => (
            <li key={r.id}>
              <button onClick={() => setOpenId(r.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[r.status]}`} />
                <span className="shrink-0 text-xs text-slate-400">{r.rfqNumber}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{r.title}</span>
                {r.costRegion && !isExternal && <span className="hidden shrink-0 text-xs text-slate-400 sm:inline">{r.costRegion.name}</span>}
                <span className="shrink-0 text-xs text-slate-400">
                  {r.quotes.length} quote{r.quotes.length === 1 ? '' : 's'}
                </span>
                <span className="shrink-0 text-xs text-slate-400">{STATUS_LABEL[r.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isExternal && (
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New RFQ title" className={`${inputClass} flex-1`} />
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            <Plus size={13} />
            Create
          </button>
        </form>
      )}

      {openRfq && (
        <RfqDetailPanel
          projectId={projectId}
          rfq={openRfq}
          contractors={contractors}
          isExternal={isExternal}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
