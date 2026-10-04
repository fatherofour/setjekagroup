'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Stamp } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { clientLink } from '@/lib/portal';
import { ApiError } from '@/lib/api-client';
import { cardClass } from '@/lib/stage0';

type Kind = 'STAGE_DELIVERABLE' | 'STAGE_TRANSITION' | 'INVESTMENT_DECISION' | 'STAGE0_PAYMENT' | 'VARIATION';

interface ApprovalItem {
  kind: Kind;
  id: string;
  title: string;
  context: string;
  href: string;
  requestedBy: string | null;
  requestedAt: string | null;
}

const KIND_LABEL: Record<Kind, string> = {
  STAGE_DELIVERABLE: 'Stage 1 document',
  STAGE_TRANSITION: 'Stage gate',
  INVESTMENT_DECISION: 'Investment decision',
  STAGE0_PAYMENT: 'Stage 0 payment',
  VARIATION: 'Variation',
};

const KIND_TONE: Record<Kind, string> = {
  STAGE_DELIVERABLE: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  STAGE_TRANSITION: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  INVESTMENT_DECISION: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  STAGE0_PAYMENT: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  VARIATION: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

/** Register COL "Approval center" / CLI "Client approvals": everything
 * waiting for the signed-in user's decision. */
export default function ApprovalsPage() {
  const { authedFetch, user } = useAuth();
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<ApprovalItem[]>('/approvals')
      .then(setItems)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load approvals.'));
  }, [authedFetch]);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Approvals</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Everything waiting for your decision — investment decisions and Stage 0 payments, Stage 1 documents and stage-gate requests.</p>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {items === null && !error ? (
        <p className="mt-4 text-sm text-slate-400">Loading…</p>
      ) : items && items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Stamp size={28} className="text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Nothing is waiting for you.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {items?.map((i) => (
            <li key={`${i.kind}-${i.id}`} className={cardClass}>
              <Link href={clientLink(i.href, user)} className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_TONE[i.kind]}`}>{KIND_LABEL[i.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{i.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {i.context}
                    {i.requestedBy && ` · from ${i.requestedBy}`}
                    {i.requestedAt && `, ${new Date(i.requestedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <ArrowRight size={15} className="text-slate-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
