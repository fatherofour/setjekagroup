'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ChevronDown, Download, FileCheck2, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { CommentThread } from '@/components/project/CommentThread';
import { DecisionDialog } from '@/components/signoff/DecisionDialog';
import { SignedCopies } from '@/components/signoff/SignedCopies';
import { OUTCOME_LABEL, defaultDueDate, dueLabel, dueTone, todayInput, type ApprovalOutcome } from '@/lib/signoff';
import { CONTRACT_FORMS, FINAL_ACCOUNT_STATUS, REVIEWER_OPTIONS, VALUATION_STATUS, download, money, reviewerTitle, type Contract, type Valuation, type ValuationLine } from '@/lib/qs';
import { contractTerms, type ContractForm } from '@/lib/projectMeta';
import { PriceAdjustmentCard } from '@/components/qs/EscalationPanels';
import { formatDate } from '@/lib/dates';

type Option = { value: string; label: string };

interface FinalAccount {
  contract: { id: string; title: string; contractor: string; currency: string; status: keyof typeof FINAL_ACCOUNT_STATUS };
  lines: { label: string; amount: number }[];
  finalAccount: number;
  change: number;
  variations: { id: string; number: string; title: string; value: number }[];
  claims: { id: string; reference: string | null; title: string | null; amount: number }[];
  sums: { id: string; description: string; type: string; allowed: number; spent: number }[];
  certifiedNet: number;
  retentionHeld: number;
}

const errText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const today = () => new Date().toISOString().slice(0, 10);

/** One valuation: the work valued line by line, then its path from the QS
 * to the architect, Setjeka's PM, the client and payment. */
function ValuationEditor({ projectId, id, onChanged, onClosed }: { projectId: string; id: string; onChanged: () => void; onClosed: () => void }) {
  const { authedFetch, accessToken } = useAuth();
  const [v, setV] = useState<Valuation | null>(null);
  const [pct, setPct] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState({ materialsOnSite: '', retentionReleasePct: '0', valuationDate: '' });
  const [due, setDue] = useState(defaultDueDate());
  const [certifying, setCertifying] = useState(false);
  const [payRef, setPayRef] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [signed, setSigned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/projects/${projectId}/qs/valuations/${id}`;

  const show = (x: Valuation) => {
    setV(x);
    setPct(Object.fromEntries((x.lines ?? []).map((l) => [l.id, String(l.rate != null ? (l.quantityToDate ?? 0) : l.percentComplete)])));
    setExtra({ materialsOnSite: String(x.materialsOnSite), retentionReleasePct: String(x.retentionReleasePct), valuationDate: x.valuationDate.slice(0, 10) });
  };

  useEffect(() => {
    authedFetch<Valuation>(base)
      .then(show)
      .catch((err) => setError(errText(err, 'Failed to load the valuation.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  async function run(fn: () => Promise<Valuation | unknown>) {
    setError(null);
    setBusy(true);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'lines' in r) show(r as Valuation);
      else if (r && typeof r === 'object' && 'valuation' in r) show((r as { valuation: Valuation }).valuation);
      onChanged();
    } catch (err) {
      setError(errText(err, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  if (error && !v) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  if (!v) return <p className="text-sm text-slate-400">Loading…</p>;

  const c = v.contract.currency;
  const can = v.can!;
  // A measured line holds its quantity to date in the same map.
  const done = (l: ValuationLine) => (l.rate != null ? (l.quantityToDate ?? 0) : l.percentComplete);
  const changed = (v.lines ?? []).some((l) => !l.dayworkSheetId && Number(pct[l.id]) !== done(l)) || Number(extra.materialsOnSite) !== v.materialsOnSite || Number(extra.retentionReleasePct) !== v.retentionReleasePct || extra.valuationDate !== v.valuationDate.slice(0, 10);
  const save = () =>
    run(() =>
      authedFetch<Valuation>(base, {
        method: 'PATCH',
        body: {
          valuationDate: extra.valuationDate,
          materialsOnSite: Number(extra.materialsOnSite) || 0,
          retentionReleasePct: Number(extra.retentionReleasePct),
          lines: (v.lines ?? []).filter((l) => !l.dayworkSheetId).map((l) => (l.rate != null ? { id: l.id, quantityToDate: Math.max(0, Number(pct[l.id]) || 0) } : { id: l.id, percentComplete: Math.min(100, Math.max(0, Number(pct[l.id]) || 0)) })),
        },
      }),
    );
  const st = VALUATION_STATUS[v.status];
  const dueTag = v.status === 'CERTIFIED' ? dueLabel(v.responseDueAt) : null;
  const title = v.certificateNumber ? `${v.certificateNumber} (valuation ${v.number})` : `Valuation ${v.number}`;

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={cardClass}>
        <button type="button" onClick={onClosed} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← Back to the contract
        </button>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
              {v.isFinal && ' · final'}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>
                {v.contract.title} · {v.contract.contractor.name}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.tone}`}>{v.decisionOutcome && v.status === 'REJECTED' ? OUTCOME_LABEL[v.decisionOutcome as ApprovalOutcome] : st.label}</span>
              {dueTag && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${dueTone(dueTag)}`}>{dueTag.text}</span>}
              <span>· prepared by {v.preparedBy.fullName}</span>
            </p>
          </div>
          <button type="button" onClick={() => download(`${base}/pdf`, accessToken, `${title} ${v.contract.title}.pdf`)} className={secondaryButton}>
            <Download size={14} />
            PDF
          </button>
        </div>
        {v.returnedReason && v.status === 'DRAFT' && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">Returned by Setjeka: {v.returnedReason}</p>}
        {v.decisionComment && <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">{v.decidedBy?.fullName}: {v.decisionComment}</p>}
      </div>

      {v.lines && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Work valued</h3>
            {can.edit && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => run(() => authedFetch(`${base}/refresh`, { method: 'POST' }))} className={secondaryButton} title="Bring in variations approved, and daywork sheets signed, since this valuation was started">
                  <RefreshCw size={14} />
                  New variations & dayworks
                </button>
                <button type="button" disabled={busy || !changed} onClick={save} className={primaryButton}>
                  {changed ? 'Save' : 'Saved'}
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800">
                  <th className="py-2 pr-2">Description</th>
                  <th className="w-32 py-2 pr-2 text-right">Contract</th>
                  <th className="w-28 py-2 pr-2 text-right">{v.lines.some((l) => l.rate != null) ? 'Qty / %' : '% complete'}</th>
                  <th className="w-32 py-2 text-right">Value to date</th>
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l) => {
                  const p = Number(pct[l.id]) || 0;
                  const measuredLine = l.rate != null;
                  const live = measuredLine ? Math.round(p * l.rate! * 100) / 100 : Math.round(l.contractAmount * p) / 100;
                  return (
                    <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-2 text-slate-800 dark:text-slate-100">
                        {l.variationId && <span className="mr-1 rounded bg-rose-50 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">Variation</span>}
                        {l.dayworkSheetId && <span className="mr-1 rounded bg-sky-50 px-1 text-[10px] text-sky-700 dark:bg-sky-950 dark:text-sky-300">Daywork</span>}
                        {l.description}
                        {measuredLine && <span className="block text-[11px] text-slate-400">measured · rate {money(l.rate)}</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{money(l.contractAmount)}</td>
                      <td className="py-1.5 pr-2 text-right">
                        {l.dayworkSheetId ? (
                          <span className="text-slate-400">signed</span>
                        ) : can.edit ? (
                          <input aria-label={measuredLine ? `Quantity to date: ${l.description}` : `% complete: ${l.description}`} type="number" min={0} max={measuredLine ? undefined : 100} step="any" className={`${inputClass} h-8 text-right`} value={pct[l.id] ?? ''} onChange={(e) => setPct({ ...pct, [l.id]: e.target.value })} />
                        ) : (
                          <span className="tabular-nums">{measuredLine ? `${l.quantityToDate ?? 0} qty` : `${l.percentComplete}%`}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{money(can.edit && !l.dayworkSheetId ? live : l.valueToDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {can.edit && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="val-date">
                  Valuation date
                </label>
                <input id="val-date" type="date" className={inputClass} value={extra.valuationDate} onChange={(e) => setExtra({ ...extra, valuationDate: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="val-mos">
                  Materials on site ({c})
                </label>
                <input id="val-mos" type="number" min={0} step="any" className={`${inputClass} text-right`} value={extra.materialsOnSite} onChange={(e) => setExtra({ ...extra, materialsOnSite: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="val-ret">
                  Retention released
                </label>
                <Select
                  id="val-ret"
                  className={inputClass}
                  value={extra.retentionReleasePct}
                  onChange={(x) => setExtra({ ...extra, retentionReleasePct: x })}
                  options={[
                    { value: '0', label: 'None' },
                    { value: '50', label: 'Half (practical completion)' },
                    { value: '100', label: 'All (final completion)' },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className={cardClass}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Amount due</h3>
        {can.edit && changed && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Save to work the amounts out again.</p>}
        <dl className="mt-3 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Work done to date</dt>
          <dd className="text-right tabular-nums">{money(v.workDone)}</dd>
          <dt className="text-slate-500">Variations to date</dt>
          <dd className="text-right tabular-nums">{money(v.variationsDone)}</dd>
          {(v.escalationToDate !== 0 || v.escalationNote) && (
            <>
              <dt className="text-slate-500">Contract price adjustment to date</dt>
              <dd className="text-right tabular-nums">{money(v.escalationToDate)}</dd>
              {v.escalationNote && <dd className={`col-span-2 text-[11px] ${/provisional|No /.test(v.escalationNote) ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400'}`}>{v.escalationNote}</dd>}
            </>
          )}
          <dt className="text-slate-500">Materials on site</dt>
          <dd className="text-right tabular-nums">{money(v.materialsOnSite)}</dd>
          <dt className="font-medium">Gross valuation</dt>
          <dd className="text-right font-medium tabular-nums">{money(v.grossValuation, c)}</dd>
          <dt className="text-slate-500">
            Less retention ({v.contract.retentionPct}%{v.retentionReleasePct ? `, ${v.retentionReleasePct}% released` : ''})
          </dt>
          <dd className="text-right tabular-nums">−{money(v.retention)}</dd>
          <dt className="text-slate-500">Less previously certified</dt>
          <dd className="text-right tabular-nums">−{money(v.previouslyCertified)}</dd>
          <dt className="font-medium">Due excluding VAT</dt>
          <dd className="text-right font-medium tabular-nums">{money(v.netDue, c)}</dd>
          <dt className="text-slate-500">VAT ({v.contract.vatPct}%)</dt>
          <dd className="text-right tabular-nums">{money(v.vat)}</dd>
          <dt className="font-semibold">Amount due</dt>
          <dd className="text-right font-semibold tabular-nums">{money(v.amountDue, c)}</dd>
        </dl>
      </div>

      {(v.reviews?.length ?? 0) > 0 && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">The {reviewerTitle(v.contract.reviewerRole)}&apos;s review</h3>
          <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {v.reviews!.map((r) => (
              <li key={r.id}>
                {formatDate(r.signedAt)} · {r.signerName}: {OUTCOME_LABEL[r.outcome as ApprovalOutcome] ?? r.outcome}
                {r.comment && ` — ${r.comment}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={`${cardClass} space-y-3`}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Next step</h3>
        {can.submit && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-xs text-slate-500">Submitting puts it on the payment certificates register for the {reviewerTitle(v.contract.reviewerRole)} to review, and tells Setjeka&apos;s Project Manager.</p>
            <button type="button" disabled={busy || changed} onClick={() => run(() => authedFetch(`${base}/submit`, { method: 'POST' }))} className={primaryButton}>
              <Send size={14} />
              Submit the valuation
            </button>
            {can.remove && (
              <button type="button" disabled={busy} onClick={() => confirm('Delete this draft valuation?') && run(async () => {
                    await authedFetch(base, { method: 'DELETE' });
                    onClosed();
                  })} className={secondaryButton} aria-label="Delete the draft valuation">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
        {v.status === 'SUBMITTED' && !can.certify && (
          <p className="text-xs text-slate-500">
            With the {reviewerTitle(v.contract.reviewerRole)} to review, then Setjeka issues the certificate{v.certifyDueAt && ` by ${formatDate(v.certifyDueAt)}`}.
          </p>
        )}
        {can.certify && v.certifyDueAt && <p className={`text-xs font-medium ${new Date(v.certifyDueAt) < new Date() ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>To be certified by {formatDate(v.certifyDueAt)} (the contract&apos;s period).</p>}
        {v.status === 'APPROVED' && v.payDueAt && <p className={`text-xs font-medium ${new Date(v.payDueAt) < new Date() ? 'text-red-700 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>To be paid by {formatDate(v.payDueAt)} (the contract&apos;s period).</p>}
        {can.certify && (
          <div className="flex flex-wrap items-end gap-2">
            <p className="w-full text-xs text-slate-500">Once the {reviewerTitle(v.contract.reviewerRole)} has approved the valuation, approve and sign to issue the payment certificate; the client then approves payment. Reject it, with your comments, to send it back to the QS.</p>
            <div>
              <label className={labelClass} htmlFor="cert-due">
                Client to respond by
              </label>
              <input id="cert-due" type="date" min={todayInput()} className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <button type="button" disabled={busy} onClick={() => setCertifying(true)} className={primaryButton}>
              <FileCheck2 size={14} />
              Decide and sign the certificate
            </button>
          </div>
        )}
        {v.status === 'CERTIFIED' && !can.decide && <p className="text-xs text-slate-500">Waiting for the client to approve payment. Setjeka cannot approve on the client&apos;s behalf.</p>}
        {can.decide && (
          <button type="button" onClick={() => setDeciding(true)} className={primaryButton}>
            Decide and sign
          </button>
        )}
        {can.pay && (
          <div className="flex flex-wrap items-end gap-2">
            <input aria-label="Payment reference" className={`${inputClass} w-56`} placeholder="Payment reference, e.g. EFT no." value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            <button type="button" disabled={busy || !payRef.trim()} onClick={() => run(() => authedFetch(`${base}/pay`, { method: 'POST', body: { paymentReference: payRef, paidAt: today() } }))} className={primaryButton}>
              Mark paid
            </button>
          </div>
        )}
        {v.status === 'PAID' && (
          <p className="text-xs text-slate-500">
            Paid {v.paidAt && formatDate(v.paidAt)} ({v.paymentReference}). It is in this month&apos;s actual on the cash flow.
          </p>
        )}
        {can.reopen && (
          <button type="button" disabled={busy} onClick={() => run(() => authedFetch(`${base}/reopen`, { method: 'POST' }))} className={secondaryButton}>
            Revise the valuation
          </button>
        )}
        {(v.certificateNumber || v.returnedReason) && <SignedCopies projectId={projectId} subjectId={v.id} refresh={signed} />}
      </div>

      <div className={cardClass}>
        <CommentThread projectId={projectId} entityType="VALUATION" entityId={v.id} />
      </div>

      {certifying && (
        <DecisionDialog
          projectId={projectId}
          title={`Payment certificate for valuation ${v.number}: ${v.contract.contractor.name}`}
          context={`${money(v.amountDue, c)} due, including VAT · gross ${money(v.grossValuation)} · retention held ${money(v.retention)}`}
          endpoint={`${base}/certify`}
          extraBody={{ responseDueAt: due }}
          subjectId={v.id}
          onClose={() => setCertifying(false)}
          onDecided={() => {
            setSigned((n) => n + 1);
            run(() => authedFetch<Valuation>(base));
          }}
        />
      )}
      {deciding && (
        <DecisionDialog
          projectId={projectId}
          title={`Payment certificate ${v.certificateNumber}: ${v.contract.contractor.name}`}
          context={`${money(v.amountDue, c)} due, including VAT · gross ${money(v.grossValuation)} · retention held ${money(v.retention)}`}
          dueAt={v.responseDueAt}
          endpoint={`${base}/decide`}
          subjectId={v.id}
          onClose={() => setDeciding(false)}
          onDecided={() => {
            setSigned((n) => n + 1);
            run(() => authedFetch<Valuation>(base));
          }}
        />
      )}
    </div>
  );
}

/** One contract: its terms, valuations, final account and cash flow. */
function ContractView({ projectId, contract, internal, isClient, onChanged, onClosed }: { projectId: string; contract: Contract; internal: boolean; isClient: boolean; onChanged: () => void; onClosed: () => void }) {
  const { authedFetch } = useAuth();
  const [valuations, setValuations] = useState<Valuation[] | null>(null);
  const [openValuation, setOpenValuation] = useState<string | null>(null);
  const [fa, setFa] = useState<FinalAccount | null>(null);
  const [newVal, setNewVal] = useState({ valuationDate: today(), isFinal: false });
  const [flow, setFlow] = useState({ startMonth: (contract.startDate ?? new Date().toISOString()).slice(0, 7), months: '12' });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const preparer = !isClient;
  const c = contract.currency;

  useEffect(() => {
    authedFetch<Valuation[]>(`/projects/${projectId}/qs/valuations?contractId=${contract.id}`)
      .then(setValuations)
      .catch((err) => setError(errText(err, 'Failed to load the valuations.')));
    if (!isClient) authedFetch<FinalAccount>(`/projects/${projectId}/qs/contracts/${contract.id}/final-account`).then(setFa).catch(() => {});
  }, [authedFetch, projectId, contract.id, isClient, version]);

  const refresh = () => {
    setVersion((n) => n + 1);
    onChanged();
  };
  async function run(fn: () => Promise<unknown>, done?: string) {
    setError(null);
    setNote(null);
    try {
      await fn();
      if (done) setNote(done);
      refresh();
    } catch (err) {
      setError(errText(err, 'Action failed.'));
    }
  }

  if (openValuation) return <ValuationEditor projectId={projectId} id={openValuation} onChanged={refresh} onClosed={() => setOpenValuation(null)} />;

  const s = contract.standing;
  const create = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const v = await authedFetch<Valuation>(`/projects/${projectId}/qs/valuations`, { method: 'POST', body: { contractId: contract.id, ...newVal } });
      setOpenValuation(v.id);
    });
  };

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {note && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{note}</p>}
      <div className={cardClass}>
        <button type="button" onClick={onClosed} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          ← All contracts
        </button>
        <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{contract.title}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {contract.contractor.name}
          {contract.contractForm && ` · ${contract.contractForm}`}
          {contract.measured && ' · measured (paid on agreed site quantities)'} · valuations reviewed by the {reviewerTitle(contract.reviewerRole)} · certify within {contract.terms.certifyWithinDays} days, pay within {contract.terms.payWithinDays} · retention {contract.retentionPct}%{contract.retentionLimitPct != null && ` up to ${contract.retentionLimitPct}% of the contract sum`} · VAT {contract.vatPct}%
          {contract.costPlan && ` · priced bill ${contract.costPlan.number}`}
          {contract.rfq && ` · from ${contract.rfq.rfqNumber}`}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              ['Contract sum', contract.contractSum],
              ['Approved variations', s.approvedVariations],
              ['Certified to date (excl. VAT)', s.certifiedNet],
              ['Retention held', s.retentionHeld],
              ['Paid (incl. VAT)', s.paid],
              ['Variations with the client', s.pendingVariations],
              ['Agreed claims', s.agreedClaims],
              ['Open claims', s.openClaims],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/40">
              <dt className="text-[11px] text-slate-500">{label}</dt>
              <dd className="tabular-nums text-slate-900 dark:text-slate-100">{money(value, c)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{isClient ? `${contract.terms.certificate}s` : `Valuations and ${contract.terms.certificate.toLowerCase()}s`}</h3>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              {isClient
                ? 'Certificates Setjeka has issued on this contract. Approve or reject each one; only you can.'
                : 'The QS values the work (QS 5.8), the architect reviews it, Setjeka’s Project Manager issues the certificate, the client approves payment, and Setjeka records it paid.'}
            </p>
          </div>
        </div>
        {preparer && !s.openValuation && !s.finalCertified && (
          <form onSubmit={create} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
            <div>
              <label className={labelClass} htmlFor={`nv-date-${contract.id}`}>
                Valuation date
              </label>
              <input id={`nv-date-${contract.id}`} type="date" className={inputClass} value={newVal.valuationDate} onChange={(e) => setNewVal({ ...newVal, valuationDate: e.target.value })} />
            </div>
            <label className="flex h-10 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={newVal.isFinal} onChange={(e) => setNewVal({ ...newVal, isFinal: e.target.checked })} />
              Final valuation
            </label>
            <button type="submit" className={primaryButton}>
              <Plus size={14} />
              New valuation
            </button>
          </form>
        )}
        {valuations === null ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : valuations.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">{isClient ? 'No certificates yet.' : 'No valuations yet.'}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {valuations.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setOpenValuation(v.id)} className="flex w-full flex-wrap items-center gap-2 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <ChevronDown size={14} className="-rotate-90 text-slate-400" />
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {v.certificateNumber ?? `Valuation ${v.number}`}
                    {v.isFinal && ' (final)'}
                  </span>
                  <span className="flex-1 text-xs text-slate-500">{formatDate(v.valuationDate)}</span>
                  <span className="tabular-nums">{money(v.amountDue, c)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${VALUATION_STATUS[v.status].tone}`}>{VALUATION_STATUS[v.status].label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preparer && <PriceAdjustmentCard projectId={projectId} contractId={contract.id} locked={s.certifiedGross > 0} onSaved={refresh} />}

      {fa && (
        <div className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Final account</h3>
              <p className="mt-1 text-xs text-slate-500">Kept up as the works go (QS 5.9) and concluded at close-out (QS 6.2). Status: {FINAL_ACCOUNT_STATUS[fa.contract.status]}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {preparer && (fa.contract.status === 'NOT_STARTED' || fa.contract.status === 'SUBMITTED') && (
                <button type="button" onClick={() => run(() => authedFetch(`/projects/${projectId}/qs/contracts/${contract.id}/final-account`, { method: 'POST', body: { action: 'prepare' } }), 'The final account is on the register, in preparation.')} className={secondaryButton}>
                  {fa.contract.status === 'SUBMITTED' ? 'Take back to revise' : 'Start the final account'}
                </button>
              )}
              {preparer && (fa.contract.status === 'NOT_STARTED' || fa.contract.status === 'IN_PREPARATION') && (
                <button type="button" onClick={() => run(() => authedFetch(`/projects/${projectId}/qs/contracts/${contract.id}/final-account`, { method: 'POST', body: { action: 'submit' } }), 'Submitted to Setjeka.')} className={primaryButton}>
                  Submit the final account
                </button>
              )}
              {internal && fa.contract.status === 'SUBMITTED' && (
                <button type="button" onClick={() => confirm('Record the final account as agreed with the contractor?') && run(() => authedFetch(`/projects/${projectId}/qs/contracts/${contract.id}/final-account`, { method: 'POST', body: { action: 'agree' } }), 'Final account agreed.')} className={primaryButton}>
                  Agreed with the contractor
                </button>
              )}
            </div>
          </div>
          <dl className="mt-3 grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {fa.lines.map((l) => (
              <div key={l.label} className="contents">
                <dt className="text-slate-500">{l.label}</dt>
                <dd className="text-right tabular-nums">{money(l.amount)}</dd>
              </div>
            ))}
            <dt className="font-semibold">Final account</dt>
            <dd className="text-right font-semibold tabular-nums">{money(fa.finalAccount, c)}</dd>
            <dt className="text-slate-500">Change on the contract sum</dt>
            <dd className={`text-right tabular-nums ${fa.change > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {fa.change > 0 ? '+' : ''}
              {money(fa.change)}
            </dd>
          </dl>
          {fa.sums.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Provisional and prime-cost sums: {fa.sums.length}; the amounts spent come from the latest valuation. <Link href={`/projects/${projectId}?tab=registers&register=claims`} className="text-emerald-700 hover:underline dark:text-emerald-400">Claims register</Link>
            </p>
          )}
        </div>
      )}

      {preparer && (
        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cash flow forecast</h3>
          <p className="mt-1 text-xs text-slate-500">Spread the contract sum over the months of the works on an S-curve, into the Cash flow register (QS 5.2). Running it again re-spreads the forecast and keeps the actuals already paid.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className={labelClass} htmlFor={`cf-start-${contract.id}`}>
                First month
              </label>
              <input id={`cf-start-${contract.id}`} type="month" className={inputClass} value={flow.startMonth} onChange={(e) => setFlow({ ...flow, startMonth: e.target.value })} />
            </div>
            <div className="w-28">
              <label className={labelClass} htmlFor={`cf-months-${contract.id}`}>
                Months
              </label>
              <input id={`cf-months-${contract.id}`} type="number" min={1} max={120} className={inputClass} value={flow.months} onChange={(e) => setFlow({ ...flow, months: e.target.value })} />
            </div>
            <button
              type="button"
              disabled={!flow.startMonth || !Number(flow.months)}
              onClick={() => run(() => authedFetch(`/projects/${projectId}/qs/contracts/${contract.id}/cash-flow`, { method: 'POST', body: { startMonth: flow.startMonth, months: Number(flow.months) } }), `Forecast spread over ${flow.months} months on the Cash flow register.`)}
              className={secondaryButton}
            >
              Spread the forecast
            </button>
            <Link href={`/projects/${projectId}?tab=registers&register=cash-flow`} className="text-xs text-emerald-700 hover:underline dark:text-emerald-400">
              Open the cash flow
            </Link>
          </div>
        </div>
      )}

      <div className={cardClass}>
        <CommentThread projectId={projectId} entityType="PROJECT_CONTRACT" entityId={contract.id} />
      </div>
    </div>
  );
}

/** PROCSA QS 4.7 to 6.2: the contracts the QS values, their payment
 * certificates and final accounts. The client sees the certificates waiting
 * for their approval. */
export function ContractsPanel({ projectId, internal, isClient, onChanged }: { projectId: string; internal: boolean; isClient: boolean; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'manual' | 'award'>('none');
  const [contractors, setContractors] = useState<Option[]>([]);
  const [plans, setPlans] = useState<Option[]>([]);
  const [awarded, setAwarded] = useState<Option[]>([]);
  const [form, setForm] = useState({ title: '', contractorId: '', contractSum: '', contractForm: '', costPlanId: '', retentionPct: '10', retentionLimitPct: '5', rfqId: '', reviewerRole: 'ARCHITECT', certifyWithinDays: '', payWithinDays: '', measured: false });
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    authedFetch<Contract[]>(`/projects/${projectId}/qs/contracts`)
      .then(setRows)
      .catch((err) => setError(errText(err, 'Failed to load the contracts.')));
  }, [authedFetch, projectId, version]);

  useEffect(() => {
    if (mode === 'none') return;
    // The company directory is Setjeka's; the QS picks from the
    // contractors on this project and the tenders it has priced.
    if (internal)
      authedFetch<unknown>('/contractors')
        .then((c) => {
          const list = (Array.isArray(c) ? c : ((c as { items?: unknown[] }).items ?? [])) as { id: string; name: string }[];
          setContractors(list.map((x) => ({ value: x.id, label: x.name })));
        })
        .catch(() => {});
    else
      authedFetch<{ contractor: { id: string; name: string } | null }[]>(`/projects/${projectId}/members`)
        .then((m) => setContractors([...new Map(m.filter((x) => x.contractor).map((x) => [x.contractor!.id, { value: x.contractor!.id, label: x.contractor!.name }])).values()]))
        .catch(() => {});
    authedFetch<{ id: string; number: string; title: string }[]>(`/projects/${projectId}/qs/cost-plans`)
      .then((p) => setPlans(p.map((x) => ({ value: x.id, label: `${x.number} ${x.title}` }))))
      .catch(() => {});
    authedFetch<{ id: string; rfqNumber: string; title: string; status: string }[]>(`/projects/${projectId}/rfqs`)
      .then((r) => setAwarded(r.filter((x) => x.status === 'AWARDED').map((x) => ({ value: x.id, label: `${x.rfqNumber} ${x.title}` }))))
      .catch(() => {});
  }, [authedFetch, projectId, internal, mode]);

  const changed = () => {
    setVersion((n) => n + 1);
    onChanged();
  };

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const c =
        mode === 'award'
          ? await authedFetch<Contract>(`/projects/${projectId}/qs/contracts/from-award`, {
              method: 'POST',
              body: { rfqId: form.rfqId, title: form.title.trim() || undefined, contractForm: form.contractForm || undefined, reviewerRole: form.reviewerRole, measured: form.measured, retentionPct: Number(form.retentionPct), retentionLimitPct: form.retentionLimitPct === '' ? null : Number(form.retentionLimitPct) },
            })
          : await authedFetch<Contract>(`/projects/${projectId}/qs/contracts`, {
              method: 'POST',
              body: {
                title: form.title.trim(),
                contractorId: form.contractorId,
                contractSum: Number(form.contractSum),
                contractForm: form.contractForm || undefined,
                costPlanId: form.costPlanId || undefined,
                reviewerRole: form.reviewerRole,
                measured: form.measured,
                certifyWithinDays: form.certifyWithinDays ? Number(form.certifyWithinDays) : undefined,
                payWithinDays: form.payWithinDays ? Number(form.payWithinDays) : undefined,
                retentionPct: Number(form.retentionPct),
                retentionLimitPct: form.retentionLimitPct === '' ? null : Number(form.retentionLimitPct),
              },
            });
      setMode('none');
      setForm({ title: '', contractorId: '', contractSum: '', contractForm: '', costPlanId: '', retentionPct: '10', retentionLimitPct: '5', rfqId: '', reviewerRole: 'ARCHITECT', certifyWithinDays: '', payWithinDays: '', measured: false });
      changed();
      setOpen(c.id);
    } catch (err) {
      setError(errText(err, 'Could not set up the contract.'));
    }
  }

  const current = rows?.find((r) => r.id === open);
  if (current) return <ContractView projectId={projectId} contract={current} internal={internal} isClient={isClient} onChanged={changed} onClosed={() => setOpen(null)} />;

  const ready = mode === 'award' ? Boolean(form.rfqId) : Boolean(form.title.trim() && form.contractorId && form.contractSum);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{isClient ? 'Contracts and payment certificates' : 'Contracts, valuations and final accounts'}</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              {isClient ? 'Each contract on your project, with the payment certificates Setjeka has issued for your approval.' : 'Set up each contract with its sum and retention terms, from an awarded tender or by hand. Valuations, the final account and the cash flow work from it.'}
            </p>
          </div>
          {!isClient && mode === 'none' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setMode('award')} className={secondaryButton}>
                From an awarded tender
              </button>
              <button type="button" onClick={() => setMode('manual')} className={secondaryButton}>
                <Plus size={14} />
                New contract
              </button>
            </div>
          )}
        </div>
        {mode !== 'none' && (
          <form onSubmit={create} className="mt-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4 dark:bg-slate-800/40">
            {mode === 'award' ? (
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="ct-rfq">
                  Awarded tender
                </label>
                <Select id="ct-rfq" className={inputClass} value={form.rfqId} onChange={(v) => setForm({ ...form, rfqId: v })} options={[{ value: '', label: awarded.length ? 'Choose' : 'No awarded tenders yet' }, ...awarded]} />
                <p className="mt-1 text-[11px] text-slate-500">The winner&apos;s prices become the priced contract bill, and their total the contract sum.</p>
              </div>
            ) : (
              <>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="ct-title">
                    Contract
                  </label>
                  <input id="ct-title" className={inputClass} placeholder="e.g. Main building contract" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="ct-contractor">
                    Contractor
                  </label>
                  <Select id="ct-contractor" className={inputClass} value={form.contractorId} onChange={(v) => setForm({ ...form, contractorId: v })} options={[{ value: '', label: contractors.length ? 'Choose' : 'No contractors on the project yet' }, ...contractors]} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ct-sum">
                    Contract sum (excl. VAT)
                  </label>
                  <input id="ct-sum" type="number" min={0} step="any" className={`${inputClass} text-right`} value={form.contractSum} onChange={(e) => setForm({ ...form, contractSum: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ct-plan">
                    Priced bill
                  </label>
                  <Select id="ct-plan" className={inputClass} value={form.costPlanId} onChange={(v) => setForm({ ...form, costPlanId: v })} options={[{ value: '', label: 'None' }, ...plans]} />
                </div>
              </>
            )}
            <div>
              <label className={labelClass} htmlFor="ct-reviewer">
                Valuations reviewed by
              </label>
              <Select id="ct-reviewer" className={inputClass} value={form.reviewerRole} onChange={(v) => setForm({ ...form, reviewerRole: v })} options={REVIEWER_OPTIONS} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ct-form">
                Form of contract
              </label>
              <Select id="ct-form" className={inputClass} value={form.contractForm} onChange={(v) => setForm({ ...form, contractForm: v })} options={CONTRACT_FORMS} />
            </div>
            <label className="flex items-start gap-2 self-end pb-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5" checked={form.measured} onChange={(e) => setForm({ ...form, measured: e.target.checked })} />
              <span>Measured contract: paid on quantities measured on site, remeasured at the end</span>
            </label>
            <div>
              <label className={labelClass} htmlFor="ct-ret">
                Retention %
              </label>
              <input id="ct-ret" type="number" min={0} max={100} step="any" className={`${inputClass} text-right`} value={form.retentionPct} onChange={(e) => setForm({ ...form, retentionPct: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ct-limit">
                Retention limit (% of sum)
              </label>
              <input id="ct-limit" type="number" min={0} max={100} step="any" className={`${inputClass} text-right`} value={form.retentionLimitPct} onChange={(e) => setForm({ ...form, retentionLimitPct: e.target.value })} />
            </div>
            {mode === 'manual' && (
              <>
                <div>
                  <label className={labelClass} htmlFor="ct-certify">
                    Days to certify
                  </label>
                  <input id="ct-certify" type="number" min={1} max={180} className={`${inputClass} text-right`} placeholder={String(contractTerms((form.contractForm || null) as ContractForm | null).certifyWithinDays)} value={form.certifyWithinDays} onChange={(e) => setForm({ ...form, certifyWithinDays: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ct-pay">
                    Days to pay
                  </label>
                  <input id="ct-pay" type="number" min={1} max={180} className={`${inputClass} text-right`} placeholder={String(contractTerms((form.contractForm || null) as ContractForm | null).payWithinDays)} value={form.payWithinDays} onChange={(e) => setForm({ ...form, payWithinDays: e.target.value })} />
                </div>
                <p className="text-[11px] text-slate-500 sm:col-span-2">Leave the days empty for the form of contract&apos;s usual periods; enter them from the contract data where they differ.</p>
              </>
            )}
            <div className="flex items-end gap-2 sm:col-span-4">
              <button type="submit" disabled={!ready} className={primaryButton}>
                Set up the contract
              </button>
              <button type="button" onClick={() => setMode('none')} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className={`${cardClass} text-sm text-slate-400`}>No contracts yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r.id)} className={`${cardClass} flex w-full flex-wrap items-center gap-2 text-left hover:border-emerald-300 dark:hover:border-emerald-800`}>
                <ChevronDown size={14} className="-rotate-90 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{r.title}</span>
                  <span className="block text-xs text-slate-500">
                    {r.contractor.name} · {r.standing.valuations} valuation{r.standing.valuations === 1 ? '' : 's'} · certified {money(r.standing.certifiedNet)} · final account {FINAL_ACCOUNT_STATUS[r.finalAccountStatus].toLowerCase()}
                  </span>
                </span>
                <span className="text-sm tabular-nums">{money(r.contractSum, r.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
