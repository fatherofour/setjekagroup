'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CURRENCY_OPTIONS } from '@/lib/projectMeta';
import { Award, FileSignature } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, formatMoney, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';

interface VendorRfq {
  id: string;
  rfqNumber: string;
  title: string;
  scopeDescription: string | null;
  discipline: string | null;
  currency: string | null;
  dueDate: string | null;
  status: 'ISSUED' | 'CLOSED' | 'AWARDED' | 'CANCELLED';
  opportunity: { name: string; location: string | null; developmentType: string | null } | null;
  project: { name: string; location: string | null } | null;
  myQuote: { id: string; price: number; currency: string; leadTimeDays: number | null; technicalProposal: string | null; commercialTerms: string | null; items: { rfqItemId: string; unitRate: number }[] } | null;
  // Priced items: the vendor quotes a unit rate for each.
  items: { id: string; description: string; unit: string; quantity: number }[];
  awardedToYou: boolean;
  acceptingQuotes: boolean;
}

function statusText(r: VendorRfq) {
  if (r.awardedToYou) return { label: 'Awarded to you', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' };
  if (r.status === 'AWARDED') return { label: 'Awarded', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
  if (r.status === 'CANCELLED') return { label: 'Cancelled', tone: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' };
  if (!r.acceptingQuotes) return { label: 'Closed — under evaluation', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
  if (r.myQuote) return { label: 'Quote submitted', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' };
  return { label: 'Awaiting your quote', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' };
}

function QuoteForm({ rfq, onSaved }: { rfq: VendorRfq; onSaved: () => void }) {
  const { authedFetch } = useAuth();
  const [price, setPrice] = useState(rfq.myQuote?.price.toString() ?? '');
  const [currency, setCurrency] = useState(rfq.myQuote?.currency ?? rfq.currency ?? 'ZAR');
  const [leadTime, setLeadTime] = useState(rfq.myQuote?.leadTimeDays?.toString() ?? '');
  const [proposal, setProposal] = useState(rfq.myQuote?.technicalProposal ?? '');
  const [terms, setTerms] = useState(rfq.myQuote?.commercialTerms ?? '');
  const [rates, setRates] = useState<Record<string, string>>(() => Object.fromEntries((rfq.myQuote?.items ?? []).map((i) => [i.rfqItemId, String(i.unitRate)])));
  const itemized = rfq.items.length > 0;
  const itemsTotal = rfq.items.reduce((s, it) => s + (Number(rates[it.id]) || 0) * it.quantity, 0);
  const ratesComplete = rfq.items.every((it) => rates[it.id] !== undefined && rates[it.id] !== '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/vendor-portal/rfqs/${rfq.id}/quote`, {
        method: 'POST',
        body: {
          price: itemized ? undefined : Number(price),
          items: itemized ? rfq.items.map((it) => ({ rfqItemId: it.id, unitRate: Number(rates[it.id]) })) : undefined,
          currency,
          leadTimeDays: leadTime ? Number(leadTime) : undefined,
          technicalProposal: proposal.trim() || undefined,
          commercialTerms: terms.trim() || undefined,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit quote.');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!confirm('Withdraw your quote?')) return;
    setBusy(true);
    try {
      await authedFetch(`/vendor-portal/rfqs/${rfq.id}/quote/withdraw`, { method: 'POST' });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to withdraw quote.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {itemized && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-1 pr-2 font-medium">Item</th>
                <th className="py-1 pr-2 text-right font-medium">Quantity</th>
                <th className="w-36 py-1 pr-2 font-medium">Your unit rate</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rfq.items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{it.description}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">
                    {it.quantity.toLocaleString()} {it.unit}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input aria-label={`Unit rate for ${it.description}`} type="number" min={0} step="any" placeholder={`per ${it.unit}`} className={`${inputClass} text-right`} value={rates[it.id] ?? ''} onChange={(e) => setRates({ ...rates, [it.id]: e.target.value })} />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{rates[it.id] ? (Number(rates[it.id]) * it.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 }) : ''}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold dark:border-slate-700">
                <td colSpan={3} className="py-1.5 pr-2 text-right">
                  Total
                </td>
                <td className="py-1.5 text-right tabular-nums">{itemsTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor={`p-${rfq.id}`}>
            {itemized ? 'Currency' : 'Your fee'} <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            {!itemized && <input id={`p-${rfq.id}`} type="number" min={0} step="any" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} />}
            <div className="w-24">
              <Select aria-label="Currency" value={currency} onChange={setCurrency} className={inputClass} options={CURRENCY_OPTIONS} />
            </div>
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor={`l-${rfq.id}`}>
            Lead time (days)
          </label>
          <input id={`l-${rfq.id}`} type="number" min={0} className={inputClass} value={leadTime} onChange={(e) => setLeadTime(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className={labelClass} htmlFor={`t-${rfq.id}`}>
            Technical proposal / approach
          </label>
          <textarea id={`t-${rfq.id}`} className={`${inputClass} h-20 resize-none py-2`} value={proposal} onChange={(e) => setProposal(e.target.value)} />
        </div>
        <div className="sm:col-span-3">
          <label className={labelClass} htmlFor={`c-${rfq.id}`}>
            Commercial terms
          </label>
          <input id={`c-${rfq.id}`} className={inputClass} placeholder="e.g. fee stages, exclusions, validity" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </div>
      </div>
      {rfq.currency && currency !== rfq.currency && (
        <p className="text-xs text-amber-700 dark:text-amber-300">This RFQ is evaluated in {rfq.currency}; a quote in another currency can’t be compared.</p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || (itemized ? !ratesComplete : !(Number(price) > 0))} className={primaryButton}>
          {rfq.myQuote ? 'Update quote' : 'Submit quote'}
        </button>
        {rfq.myQuote && (
          <button type="button" disabled={busy} onClick={withdraw} className={secondaryButton}>
            Withdraw
          </button>
        )}
      </div>
    </form>
  );
}

export default function VendorPortalRfqsPage() {
  const { authedFetch } = useAuth();
  const [rfqs, setRfqs] = useState<VendorRfq[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = () =>
    authedFetch<VendorRfq[]>('/vendor-portal/rfqs')
      .then(setRfqs)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load RFQs.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My RFQs</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Requests for quotation Setjeka has sent you. Your quote is only ever visible to Setjeka.</p>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {rfqs === null && !error ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : rfqs && rfqs.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <FileSignature size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No RFQs yet.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rfqs?.map((r) => {
            const s = statusText(r);
            const context = r.opportunity ?? r.project;
            return (
              <div key={r.id} className={cardClass}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">{r.rfqNumber}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{r.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.tone}`}>
                    {r.awardedToYou && <Award size={11} className="mr-1 inline" />}
                    {s.label}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {[context?.name, context?.location, r.discipline, r.dueDate && `Due ${new Date(r.dueDate).toLocaleDateString()}`].filter(Boolean).join(' · ')}
                </p>
                {r.scopeDescription && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{r.scopeDescription}</p>}
                {r.myQuote && open !== r.id && (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    Your quote: <strong>{formatMoney(r.myQuote.price, r.myQuote.currency)}</strong>
                    {r.myQuote.leadTimeDays != null && ` · ${r.myQuote.leadTimeDays} days`}
                  </p>
                )}
                {r.acceptingQuotes && open !== r.id && (
                  <button type="button" className={`${primaryButton} mt-3`} onClick={() => setOpen(r.id)}>
                    {r.myQuote ? 'Edit quote' : 'Submit a quote'}
                  </button>
                )}
                {r.acceptingQuotes && open === r.id && (
                  <QuoteForm
                    rfq={r}
                    onSaved={() => {
                      setOpen(null);
                      load();
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
