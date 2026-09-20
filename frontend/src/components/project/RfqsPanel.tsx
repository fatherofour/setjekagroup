'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, X, Send, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import type { Contractor } from '@/lib/contractors';

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

const STATUS_DOT: Record<RfqStatus, string> = {
  DRAFT: 'bg-slate-400',
  ISSUED: 'bg-blue-500',
  CLOSED: 'bg-slate-500',
  AWARDED: 'bg-emerald-500',
  CANCELLED: 'bg-red-500',
};

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const DEFAULT_CRITERIA = ['Price', 'Technical compliance', 'Programme', 'Quality'];

function QuoteCard({
  projectId,
  rfqId,
  quote,
  isExternal,
  onChanged,
}: {
  projectId: string;
  rfqId: string;
  quote: Quote;
  isExternal: boolean;
  onChanged: () => void;
}) {
  const { authedFetch } = useAuth();
  const [scores, setScores] = useState<{ criterion: string; weight: number; score: number }[]>(
    quote.evaluationScores && quote.evaluationScores.length > 0
      ? quote.evaluationScores
      : DEFAULT_CRITERIA.map((criterion) => ({ criterion, weight: 25, score: 0 })),
  );
  const [saving, setSaving] = useState(false);

  async function saveEvaluation() {
    setSaving(true);
    try {
      await authedFetch(`/projects/${projectId}/rfqs/${rfqId}/quotes/${quote.id}/evaluate`, { method: 'PATCH', body: { scores } });
      onChanged();
    } catch {
      // Error surfaces via the parent's reload/error banner on next load.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{quote.contractor.name}</span>
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
          {quote.currency} {quote.price.toLocaleString()}
        </span>
      </div>
      <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">
        {quote.leadTimeDays != null && `Lead time: ${quote.leadTimeDays}d · `}
        {quote.warrantyTerms && `Warranty: ${quote.warrantyTerms}`}
      </p>

      {!isExternal && (
        <div className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
          {scores.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-32 shrink-0 truncate text-slate-500 dark:text-slate-400">{s.criterion}</span>
              <input
                type="number"
                className={`${inputClass} h-6 w-16`}
                value={s.weight}
                title="Weight %"
                onChange={(e) => setScores(scores.map((x, idx) => (idx === i ? { ...x, weight: Number(e.target.value) } : x)))}
              />
              <input
                type="number"
                min={0}
                max={10}
                className={`${inputClass} h-6 w-16`}
                value={s.score}
                title="Score /10"
                onChange={(e) => setScores(scores.map((x, idx) => (idx === i ? { ...x, score: Number(e.target.value) } : x)))}
              />
            </div>
          ))}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {quote.evaluationTotal != null ? `Weighted total: ${quote.evaluationTotal.toFixed(2)}` : 'Not yet evaluated'}
            </span>
            <button
              onClick={saveEvaluation}
              disabled={saving}
              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
            >
              Save evaluation
            </button>
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
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteContractorId, setInviteContractorId] = useState('');
  const [quoteForm, setQuoteForm] = useState({ price: '', currency: 'ZAR', leadTimeDays: '', warrantyTerms: '' });
  const [saving, setSaving] = useState(false);

  const loadQuotes = () => {
    authedFetch<Quote[]>(`/projects/${projectId}/rfqs/${rfq.id}/quotes`)
      .then(setQuotes)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load quotes.'));
  };

  useEffect(() => {
    loadQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq.id]);

  async function invite() {
    if (!inviteContractorId) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/rfqs/${rfq.id}/invitations`, { method: 'POST', body: { contractorId: inviteContractorId } });
      setInviteContractorId('');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite vendor.');
    } finally {
      setSaving(false);
    }
  }

  async function issue() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/rfqs/${rfq.id}/issue`, { method: 'PATCH' });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to issue RFQ.');
    } finally {
      setSaving(false);
    }
  }

  async function submitQuote(e: FormEvent) {
    e.preventDefault();
    if (!quoteForm.price) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/rfqs/${rfq.id}/quotes`, {
        method: 'POST',
        body: {
          price: Number(quoteForm.price),
          currency: quoteForm.currency,
          leadTimeDays: quoteForm.leadTimeDays ? Number(quoteForm.leadTimeDays) : undefined,
          warrantyTerms: quoteForm.warrantyTerms || undefined,
        },
      });
      setQuoteForm({ price: '', currency: 'ZAR', leadTimeDays: '', warrantyTerms: '' });
      loadQuotes();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit quote.');
    } finally {
      setSaving(false);
    }
  }

  const invitedIds = new Set(rfq.invitations.map((i) => i.contractor.id));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rfq.rfqNumber}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <h3 className="text-base font-medium text-slate-900 dark:text-slate-100">{rfq.title}</h3>
        {rfq.scopeDescription && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{rfq.scopeDescription}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[rfq.status]}`} />
          <span className="text-xs text-slate-500 dark:text-slate-400">{rfq.status}</span>
          {!isExternal && rfq.status === 'DRAFT' && (
            <button onClick={issue} disabled={saving} className="ml-2 flex items-center gap-1 rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              <Send size={12} />
              Issue RFQ
            </button>
          )}
        </div>

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
                onClick={invite}
                disabled={saving || !inviteContractorId}
                className="flex h-8 items-center gap-1 rounded-md bg-slate-100 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                <UserPlus size={13} />
                Invite
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Quotes {isExternal ? '(yours)' : '— side by side'}
          </h4>
          {quotes === null ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : quotes.length === 0 ? (
            <p className="mb-2 text-sm text-slate-400 dark:text-slate-500">No quotes submitted yet.</p>
          ) : (
            <div className="mb-3 space-y-2">
              {quotes.map((q) => (
                <QuoteCard key={q.id} projectId={projectId} rfqId={rfq.id} quote={q} isExternal={isExternal} onChanged={loadQuotes} />
              ))}
            </div>
          )}

          {isExternal && rfq.status === 'ISSUED' && (
            <form onSubmit={submitQuote} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Price"
                  className={`${inputClass} flex-1`}
                  value={quoteForm.price}
                  onChange={(e) => setQuoteForm({ ...quoteForm, price: e.target.value })}
                />
                <Select
                  value={quoteForm.currency}
                  onChange={(v) => setQuoteForm({ ...quoteForm, currency: v })}
                  options={[{ value: 'ZAR', label: 'ZAR' }, { value: 'USD', label: 'USD' }]}
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Lead time (days)"
                  className={`${inputClass} flex-1`}
                  value={quoteForm.leadTimeDays}
                  onChange={(e) => setQuoteForm({ ...quoteForm, leadTimeDays: e.target.value })}
                />
                <input
                  placeholder="Warranty terms"
                  className={`${inputClass} flex-1`}
                  value={quoteForm.warrantyTerms}
                  onChange={(e) => setQuoteForm({ ...quoteForm, warrantyTerms: e.target.value })}
                />
              </div>
              <button
                type="submit"
                disabled={saving || !quoteForm.price}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Submit quote
              </button>
            </form>
          )}
        </div>
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
      await authedFetch(`/projects/${projectId}/rfqs`, { method: 'POST', body: { title: title.trim() } });
      setTitle('');
      load();
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
                <span className="shrink-0 text-xs text-slate-400">{r.quotes.length} quote{r.quotes.length === 1 ? '' : 's'}</span>
                <span className="shrink-0 text-xs text-slate-400">{r.status}</span>
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
