'use client';

import { useEffect, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { OUTCOME_LABEL, OUTCOME_TONE, openSignedCopy, type ApprovalRecord } from '@/lib/signoff';

/** The signed copies of one item's decisions, newest first. Renders nothing
 * until there is at least one. `refresh` reloads after a new decision. */
export function SignedCopies({ projectId, subjectId, refresh = 0, compact = false }: { projectId: string; subjectId: string; refresh?: number; compact?: boolean }) {
  const { authedFetch, accessToken } = useAuth();
  const [records, setRecords] = useState<ApprovalRecord[]>([]);

  useEffect(() => {
    authedFetch<ApprovalRecord[]>(`/projects/${projectId}/approval-records?subjectId=${subjectId}`)
      .then(setRecords)
      .catch(() => setRecords([]));
  }, [authedFetch, projectId, subjectId, refresh]);

  if (records.length === 0) return null;
  const shown = compact ? records.slice(0, 1) : records;
  return (
    <ul className="space-y-1">
      {shown.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className={`rounded-full px-2 py-0.5 font-medium ${OUTCOME_TONE[r.outcome]}`}>{OUTCOME_LABEL[r.outcome]}</span>
          <span>
            {r.signerName}
            {r.signerRole ? `, ${r.signerRole}` : ''} · {new Date(r.signedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <button type="button" onClick={() => openSignedCopy(projectId, r.id, accessToken)} className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            <FileSignature size={12} /> Signed copy
          </button>
          {r.comment && <span className="basis-full text-slate-500">&ldquo;{r.comment}&rdquo;</span>}
        </li>
      ))}
    </ul>
  );
}
