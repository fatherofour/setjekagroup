'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal';

export type EvidenceLink = 'APPROVAL' | 'SITE' | 'MARKET_RESEARCH' | 'PAYMENT' | 'BUSINESS_CASE';

export interface EvidenceDoc {
  id: string;
  title: string;
  linkType: EvidenceLink | null;
  linkId: string | null;
  originalFilename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedBy: { fullName: string };
}

const LINK_LABEL: Record<EvidenceLink, string> = {
  APPROVAL: 'Land right',
  SITE: 'Site',
  MARKET_RESEARCH: 'Market research',
  PAYMENT: 'Payment',
  BUSINESS_CASE: 'Business case',
};

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Stage 0 evidence (register DEV R11 "evidence"): files attached to one
 * record — a land right, the site, a research report, an invoice — or, with
 * no link, the opportunity's general documents. */
export function EvidenceFiles({
  opportunityId,
  linkType,
  linkId,
  readOnly = false,
  compact = false,
  showLinks = false,
  refreshKey,
}: {
  opportunityId: string;
  linkType?: EvidenceLink;
  linkId?: string;
  readOnly?: boolean;
  compact?: boolean;
  showLinks?: boolean;
  refreshKey?: number;
}) {
  const { authedFetch, accessToken } = useAuth();
  const [docs, setDocs] = useState<EvidenceDoc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ filename: string; mimeType: string; blobUrl: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const base = `/opportunities/${opportunityId}/documents`;

  const load = () =>
    authedFetch<EvidenceDoc[]>(base)
      .then((all) => setDocs(linkType ? all.filter((d) => d.linkType === linkType && d.linkId === linkId) : all))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load files.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, linkType, linkId, refreshKey]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (linkType && linkId) {
        formData.append('linkType', linkType);
        formData.append('linkId', linkId);
      }
      await authedFetch(base, { method: 'POST', formData });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function view(d: EvidenceDoc) {
    try {
      setPreview({ filename: d.originalFilename, mimeType: d.mimeType, blobUrl: await apiFetchBlobUrl(`${base}/${d.id}/file`, accessToken) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to open the file.');
    }
  }

  async function remove(d: EvidenceDoc) {
    if (!confirm(`Delete ${d.originalFilename}?`)) return;
    try {
      await authedFetch(`${base}/${d.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete the file.');
    }
  }

  return (
    <div className={compact ? '' : 'space-y-2'}>
      {error && <p className="mb-1 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap items-center gap-1.5">
        {docs?.map((d) => (
          <span key={d.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900">
            <FileText size={12} className="shrink-0 text-slate-400" />
            <button type="button" onClick={() => view(d)} className="truncate text-slate-700 hover:underline dark:text-slate-200" title={`${d.originalFilename} · ${kb(d.size)} · ${d.uploadedBy.fullName}`}>
              {d.title}
            </button>
            {showLinks && d.linkType && <span className="text-slate-400">· {LINK_LABEL[d.linkType]}</span>}
            {!readOnly && (
              <button type="button" aria-label={`Delete ${d.title}`} onClick={() => remove(d)} className="text-slate-400 hover:text-red-600">
                <Trash2 size={11} />
              </button>
            )}
          </span>
        ))}
        {docs && docs.length === 0 && !compact && <span className="text-xs text-slate-400">No files yet.</span>}
        {!readOnly && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
            <Paperclip size={12} />
            {busy ? 'Uploading…' : 'Attach evidence'}
            <input
              ref={input}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
        )}
      </div>
      {preview && (
        <DocumentPreviewModal
          filename={preview.filename}
          mimeType={preview.mimeType}
          blobUrl={preview.blobUrl}
          onClose={() => {
            URL.revokeObjectURL(preview.blobUrl);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
