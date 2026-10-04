'use client';

import { useState, type FormEvent } from 'react';
import { Award, ChevronDown, Info, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { RFQ_STATUS_LABEL, RFQ_STATUS_TONE, formatMoney, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { ratingText, type ConsultantRfq, type RankingEntry } from './consultantTypes';

interface Props {
  // "/opportunities/<id>/rfqs" or "/projects/<id>/consultant-rfqs"
  basePath: string;
  rfq: ConsultantRfq;
  readOnly: boolean;
  onChange: () => void;
}

function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-600 dark:text-slate-300">{value.toFixed(1)}</span>
    </div>
  );
}

export function ConsultantRfqCard({ basePath, rfq, readOnly, onChange }: Props) {
  const { authedFetch } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ contractorId: '', price: '', leadTimeDays: '', notes: '' });
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [awarding, setAwarding] = useState<RankingEntry | null>(null);
  const [justification, setJustification] = useState('');
  const [expanded, setExpanded] = useState(rfq.status !== 'AWARDED' && rfq.status !== 'CANCELLED');

  const base = `${basePath}/${rfq.id}`;
  // Meeting 3: a Stage 0 (opportunity) selection is indicative, not binding.
  const indicative = basePath.startsWith('/opportunities');
  const quoted = new Set(rfq.quotes.map((q) => q.contractorId));
  const appointment = rfq.appointment;
  const canQuote = !readOnly && (rfq.status === 'ISSUED' || rfq.status === 'CLOSED');
  const canAward = canQuote;
  const recommended = rfq.ranking.find((r) => r.recommended) ?? null;

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChange();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function recordQuote(e: FormEvent) {
    e.preventDefault();
    const ok = await run(
      () =>
        authedFetch(`${base}/quotes`, {
          method: 'POST',
          body: {
            contractorId: quoteForm.contractorId,
            price: Number(quoteForm.price),
            currency: rfq.currency ?? 'ZAR',
            leadTimeDays: quoteForm.leadTimeDays ? Number(quoteForm.leadTimeDays) : undefined,
            technicalProposal: quoteForm.notes.trim() || undefined,
          },
        }),
      'Failed to record quote.',
    );
    if (ok) {
      setQuoteForm({ contractorId: '', price: '', leadTimeDays: '', notes: '' });
      setShowQuoteForm(false);
    }
  }

  async function confirmAward() {
    if (!awarding) return;
    const ok = await run(
      () => authedFetch(`${base}/award`, { method: 'POST', body: { quoteId: awarding.quoteId, justification: justification.trim() || undefined } }),
      'Failed to appoint consultant.',
    );
    if (ok) {
      setAwarding(null);
      setJustification('');
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left">
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        <span className="font-mono text-xs text-slate-400">{rfq.rfqNumber}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{rfq.title}</span>
        <span className="text-xs text-slate-400">
          {rfq.quotes.length}/{rfq.invitations.length} quoted
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RFQ_STATUS_TONE[rfq.status]}`}>{RFQ_STATUS_LABEL[rfq.status]}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-100 px-3 py-3 dark:border-slate-800">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span>Discipline: {rfq.discipline}</span>
            {rfq.dueDate && <span>Quotes due {new Date(rfq.dueDate).toLocaleDateString()}</span>}
            <span>
              Evaluated on price {rfq.priceWeight}% · track record {rfq.ratingWeight}%
            </span>
            <span>Currency: {rfq.currency}</span>
          </div>
          {rfq.scopeDescription && <p className="text-sm text-slate-600 dark:text-slate-300">{rfq.scopeDescription}</p>}

          {!readOnly && rfq.status !== 'AWARDED' && rfq.status !== 'CANCELLED' && (
            <div className="flex flex-wrap gap-2">
              {rfq.status === 'DRAFT' && (
                <button type="button" disabled={busy} className={primaryButton} onClick={() => run(() => authedFetch(`${base}/issue`, { method: 'POST' }), 'Failed to issue RFQ.')}>
                  Issue to {rfq.invitations.length} {rfq.invitations.length === 1 ? 'firm' : 'firms'}
                </button>
              )}
              {rfq.status === 'ISSUED' && (
                <button type="button" disabled={busy} className={secondaryButton} onClick={() => run(() => authedFetch(`${base}/close`, { method: 'POST' }), 'Failed to close RFQ.')}>
                  Close quoting
                </button>
              )}
              {rfq.status === 'CLOSED' && (
                <button type="button" disabled={busy} className={secondaryButton} onClick={() => run(() => authedFetch(`${base}/issue`, { method: 'POST' }), 'Failed to reopen RFQ.')}>
                  Reopen for quotes
                </button>
              )}
              {canQuote && (
                <button type="button" className={secondaryButton} onClick={() => setShowQuoteForm((v) => !v)}>
                  Record a quote received
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                className={`${secondaryButton} text-red-600 dark:text-red-400`}
                onClick={() => confirm(`Delete ${rfq.rfqNumber}? Its quotes are deleted too.`) && run(() => authedFetch(base, { method: 'DELETE' }), 'Failed to delete RFQ.')}
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          )}

          {showQuoteForm && canQuote && (
            <form onSubmit={recordQuote} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
              <div className="sm:col-span-2">
                <label className={labelClass}>From</label>
                <Select
                  aria-label="Consultant"
                  value={quoteForm.contractorId}
                  onChange={(v) => setQuoteForm({ ...quoteForm, contractorId: v })}
                  className={inputClass}
                  options={[
                    { value: '', label: 'Choose firm…' },
                    ...rfq.invitations.map((i) => ({ value: i.contractorId, label: `${i.contractor.name}${quoted.has(i.contractorId) ? ' (replace quote)' : ''}` })),
                  ]}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`q-price-${rfq.id}`}>
                  Fee ({rfq.currency})
                </label>
                <input id={`q-price-${rfq.id}`} type="number" min={0} step="any" className={inputClass} value={quoteForm.price} onChange={(e) => setQuoteForm({ ...quoteForm, price: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor={`q-lead-${rfq.id}`}>
                  Lead time (days)
                </label>
                <input id={`q-lead-${rfq.id}`} type="number" min={0} className={inputClass} value={quoteForm.leadTimeDays} onChange={(e) => setQuoteForm({ ...quoteForm, leadTimeDays: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <input aria-label="Notes" placeholder="Notes on the proposal (optional)" className={inputClass} value={quoteForm.notes} onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
              </div>
              <button type="submit" disabled={busy || !quoteForm.contractorId || !(Number(quoteForm.price) > 0)} className={`${primaryButton} justify-center`}>
                Save quote
              </button>
            </form>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Invited ({rfq.invitations.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {rfq.invitations.map((i) => (
                <span
                  key={i.id}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    quoted.has(i.contractorId)
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                  title={ratingText(i.rating)}
                >
                  {i.contractor.name} · {quoted.has(i.contractorId) ? 'quoted' : 'awaiting'}
                </span>
              ))}
            </div>
          </div>

          {rfq.ranking.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Automatic evaluation</p>
                <span
                  className="text-slate-400"
                  title={`Price score: lowest fee = 100, others = lowest ÷ their fee × 100. Track record: average of past star ratings and vendor scorecards as % of 5★ (firms with no history are scored at a neutral 3★). Overall = ${rfq.priceWeight}% price + ${rfq.ratingWeight}% track record.`}
                >
                  <Info size={12} />
                </span>
              </div>

              {recommended && rfq.status !== 'AWARDED' && (
                <p className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <Award size={14} className="mr-1 inline" />
                  Recommended: <strong>{recommended.contractorName}</strong> — overall {recommended.combinedScore?.toFixed(1)} at {formatMoney(recommended.price, recommended.currency)}.
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-400 dark:border-slate-800">
                      <th className="py-1.5 pr-2 font-medium">#</th>
                      <th className="py-1.5 pr-2 font-medium">Firm</th>
                      <th className="py-1.5 pr-2 text-right font-medium">Fee</th>
                      <th className="py-1.5 pr-2 font-medium">Price score</th>
                      <th className="py-1.5 pr-2 font-medium">Track record</th>
                      <th className="py-1.5 pr-2 font-medium">Overall</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {rfq.ranking.map((r) => {
                      const isAppointed = appointment?.quoteId === r.quoteId;
                      return (
                        <tr
                          key={r.quoteId}
                          className={`border-b border-slate-50 last:border-0 dark:border-slate-800/60 ${
                            isAppointed ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : r.recommended && rfq.status !== 'AWARDED' ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="py-2 pr-2 text-xs font-semibold tabular-nums text-slate-500">{r.rank ?? '—'}</td>
                          <td className="py-2 pr-2">
                            <p className="font-medium text-slate-800 dark:text-slate-100">
                              {r.contractorName}
                              {r.recommended && <span className="ml-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Recommended</span>}
                              {isAppointed && <span className="ml-1.5 rounded-full bg-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold text-white">{indicative ? 'Selected' : 'Appointed'}</span>}
                            </p>
                            {r.excludedReason && <p className="text-xs text-amber-600 dark:text-amber-400">{r.excludedReason}</p>}
                            {r.leadTimeDays != null && <p className="text-xs text-slate-400">{r.leadTimeDays} days lead time</p>}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums text-slate-700 dark:text-slate-200">{formatMoney(r.price, r.currency)}</td>
                          <td className="py-2 pr-2">
                            <ScoreBar value={r.priceScore} />
                          </td>
                          <td className="py-2 pr-2">
                            <ScoreBar value={r.ratingScore} />
                            <p className="text-[11px] text-slate-400">
                              {r.ratingAverage === null ? 'No history — neutral 3★' : `${r.ratingAverage.toFixed(1)}★ · ${r.ratingCount} ${r.ratingCount === 1 ? 'rating' : 'ratings'}`}
                            </p>
                          </td>
                          <td className="py-2 pr-2">
                            <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{r.combinedScore?.toFixed(1) ?? '—'}</span>
                          </td>
                          <td className="py-2 text-right">
                            {canAward && r.rank !== null && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAwarding(r);
                                  setJustification('');
                                }}
                                className={r.recommended ? 'h-7 rounded-md bg-emerald-700 px-2.5 text-xs font-medium text-white hover:bg-emerald-800' : 'h-7 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}
                              >
                                {indicative ? 'Select' : 'Appoint'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {awarding && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
              <p className="text-sm text-slate-800 dark:text-slate-100">
                {indicative ? 'Select' : 'Appoint'} <strong>{awarding.contractorName}</strong> as {rfq.discipline} for {formatMoney(awarding.price, awarding.currency)}?
                {indicative && <span className="block text-xs text-slate-500">An indicative selection: not binding, and confirmed or changed at Inception.</span>}
              </p>
              {!awarding.recommended && (
                <>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    The system recommends {recommended?.contractorName}. Record why you are choosing differently — this is kept with the appointment.
                  </p>
                  <textarea
                    aria-label="Justification"
                    className={`${inputClass} mt-2 h-16 resize-none py-2`}
                    placeholder="e.g. Specialist heritage experience required for this site"
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                  />
                </>
              )}
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={busy || (!awarding.recommended && !justification.trim())} onClick={confirmAward} className={primaryButton}>
                  {indicative ? 'Confirm selection' : 'Confirm appointment'}
                </button>
                <button type="button" onClick={() => setAwarding(null)} className={secondaryButton}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {appointment?.justification && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Appointed over the recommendation (ranked #{appointment.rankAtAward}). Reason: {appointment.justification}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
