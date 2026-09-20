'use client';

import { useEffect, useState } from 'react';
import { X, FileWarning } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { apiFetchBlobUrl } from '@/lib/api-client';

interface RevisionForCompare {
  id: string;
  revisionNumber: string;
  originalFilename: string;
  mimeType: string;
  uploadedAt: string;
  reviewStatus: string;
}

function Pane({ projectId, documentId, revision }: { projectId: string; documentId: string; revision: RevisionForCompare }) {
  const { accessToken } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    apiFetchBlobUrl(`/projects/${projectId}/documents/${documentId}/revisions/${revision.id}/file`, accessToken).then((url) => {
      revoked = url;
      setBlobUrl(url);
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision.id]);

  const isImage = revision.mimeType.startsWith('image/');
  const isPdf = revision.mimeType === 'application/pdf';

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-slate-200 px-3 py-2 text-xs dark:border-slate-800">
        <p className="font-medium text-slate-800 dark:text-slate-100">Rev {revision.revisionNumber}</p>
        <p className="text-slate-400">
          {new Date(revision.uploadedAt).toLocaleString()} · {revision.reviewStatus.replace('_', ' ')}
        </p>
      </div>
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
        {!blobUrl ? (
          <p className="p-4 text-center text-xs text-slate-400">Loading…</p>
        ) : isImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={blobUrl} alt={revision.originalFilename} className="mx-auto max-h-[60vh] w-auto object-contain" />
        ) : isPdf ? (
          <iframe src={blobUrl} title={revision.originalFilename} className="h-[60vh] w-full border-0" />
        ) : (
          <div className="flex h-[30vh] flex-col items-center justify-center gap-2 text-center">
            <FileWarning size={24} className="text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-500 dark:text-slate-400">Preview isn&apos;t available for this file type.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Side-by-side, not overlay — true pixel/vector diffing needs a rendering
// engine this app doesn't have, so two panes plus metadata is the honest V1.
export function RevisionCompareModal({
  projectId,
  documentId,
  revisionA,
  revisionB,
  onClose,
}: {
  projectId: string;
  documentId: string;
  revisionA: RevisionForCompare;
  revisionB: RevisionForCompare;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Compare revisions</p>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-1 divide-x divide-slate-200 overflow-hidden dark:divide-slate-800">
          <Pane projectId={projectId} documentId={documentId} revision={revisionA} />
          <Pane projectId={projectId} documentId={documentId} revision={revisionB} />
        </div>
      </div>
    </div>
  );
}
