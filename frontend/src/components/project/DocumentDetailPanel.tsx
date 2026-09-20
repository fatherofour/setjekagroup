'use client';

import { useState } from 'react';
import { X, Trash2, Upload as UploadIcon, Eye, Download, Check, XCircle, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal';
import { Select } from '@/components/ui/Select';
import { CommentThread } from './CommentThread';
import { RevisionCompareModal } from './RevisionCompareModal';
import type { ProjectDocument } from './DocumentsPanel';

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const REVIEW_BADGE: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  APPROVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  REVISION_REQUESTED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

export function DocumentDetailPanel({
  projectId,
  document,
  onClose,
  onChanged,
}: {
  projectId: string;
  document: ProjectDocument;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { authedFetch, accessToken } = useAuth();
  const [form, setForm] = useState({
    name: document.name,
    description: document.description ?? '',
    documentType: document.documentType ?? '',
    discipline: document.discipline ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRevisionNumber, setNewRevisionNumber] = useState('');
  const [newRevisionFile, setNewRevisionFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ filename: string; mimeType: string | null; blobUrl: string } | null>(null);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [compareRevisionId, setCompareRevisionId] = useState('');

  const current = document.revisions[0];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/documents/${document.id}`, {
        method: 'PATCH',
        body: {
          name: form.name,
          description: form.description || null,
          documentType: form.documentType || null,
          discipline: form.discipline || null,
        },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save document.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${document.name}" and all its revisions?`)) return;
    await authedFetch(`/projects/${projectId}/documents/${document.id}`, { method: 'DELETE' });
    onChanged();
    onClose();
  }

  async function uploadRevision() {
    if (!newRevisionFile) return;
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      if (newRevisionNumber.trim()) formData.append('revisionNumber', newRevisionNumber.trim());
      formData.append('file', newRevisionFile);
      await authedFetch(`/projects/${projectId}/documents/${document.id}/revisions`, { method: 'POST', formData });
      setNewRevisionNumber('');
      setNewRevisionFile(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload revision.');
    } finally {
      setSaving(false);
    }
  }

  async function review(revisionId: string, reviewStatus: string) {
    try {
      await authedFetch(`/projects/${projectId}/documents/${document.id}/revisions/${revisionId}/review`, {
        method: 'PATCH',
        body: { reviewStatus },
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update review status.');
    }
  }

  async function viewRevision(revisionId: string, filename: string, mimeType: string) {
    try {
      const url = await apiFetchBlobUrl(`/projects/${projectId}/documents/${document.id}/revisions/${revisionId}/file`, accessToken);
      setPreview({ filename, mimeType, blobUrl: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load file.');
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.blobUrl);
    setPreview(null);
  }

  const olderRevisions = document.revisions.slice(1);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Document</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        <div className="space-y-2">
          <input className={`${inputClass} h-9 w-full`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea
            className="h-16 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} placeholder="Type" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} />
            <input className={inputClass} placeholder="Discipline" value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value })} />
          </div>
          <button onClick={save} disabled={saving} className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Revisions</h3>
          <ul className="mb-2 space-y-1.5">
            {document.revisions.map((rev, i) => (
              <li key={rev.id} className="rounded-md bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-800/50">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Rev {rev.revisionNumber} {i === 0 && <span className="text-emerald-600 dark:text-emerald-400">(current)</span>}
                  </span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${REVIEW_BADGE[rev.reviewStatus]}`}>{rev.reviewStatus.replace('_', ' ')}</span>
                </div>
                <p className="mb-1.5 text-slate-400">{new Date(rev.uploadedAt).toLocaleString()}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => viewRevision(rev.id, rev.originalFilename, rev.mimeType)} className="flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400">
                    <Eye size={12} />
                    View
                  </button>
                  <button
                    onClick={() => {
                      apiFetchBlobUrl(`/projects/${projectId}/documents/${document.id}/revisions/${rev.id}/file?download=1`, accessToken).then((url) => {
                        const a = window.document.createElement('a');
                        a.href = url;
                        a.download = rev.originalFilename;
                        a.click();
                        URL.revokeObjectURL(url);
                      });
                    }}
                    className="flex items-center gap-1 text-slate-500 hover:underline dark:text-slate-400"
                  >
                    <Download size={12} />
                    Download
                  </button>
                  {i === 0 && (
                    <>
                      <button onClick={() => review(rev.id, 'APPROVED')} className="flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-400">
                        <Check size={12} />
                        Approve
                      </button>
                      <button onClick={() => review(rev.id, 'REVISION_REQUESTED')} className="flex items-center gap-1 text-amber-600 hover:underline dark:text-amber-400">
                        <RotateCcw size={12} />
                        Request revision
                      </button>
                      <button onClick={() => review(rev.id, 'REJECTED')} className="flex items-center gap-1 text-red-600 hover:underline dark:text-red-400">
                        <XCircle size={12} />
                        Reject
                      </button>
                    </>
                  )}
                  {i > 0 && (
                    <button
                      onClick={() => setCompareWith(rev.id)}
                      className="flex items-center gap-1 text-slate-500 hover:underline dark:text-slate-400"
                    >
                      Compare with current
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newRevisionNumber}
              onChange={(e) => setNewRevisionNumber(e.target.value)}
              placeholder="Revision # (optional)"
              className={`${inputClass} w-32`}
            />
            <input type="file" onChange={(e) => setNewRevisionFile(e.target.files?.[0] ?? null)} className="text-xs text-slate-600 dark:text-slate-300" />
            <button
              onClick={uploadRevision}
              disabled={saving || !newRevisionFile}
              className="flex h-8 items-center gap-1.5 rounded-md bg-slate-100 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
            >
              <UploadIcon size={13} />
              Upload new revision
            </button>
          </div>

          {olderRevisions.length > 0 && !compareWith && (
            <div className="mt-2 flex items-center gap-2">
              <Select
                value={compareRevisionId}
                onChange={setCompareRevisionId}
                className={inputClass}
                options={[{ value: '', label: 'Compare current with…' }, ...olderRevisions.map((r) => ({ value: r.id, label: `Rev ${r.revisionNumber}` }))]}
              />
              <button
                onClick={() => compareRevisionId && setCompareWith(compareRevisionId)}
                disabled={!compareRevisionId}
                className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200"
              >
                Compare
              </button>
            </div>
          )}
        </div>

        {current && (
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
            <CommentThread projectId={projectId} entityType="DOCUMENT_REVISION" entityId={current.id} />
          </div>
        )}

        <button onClick={remove} className="mt-4 flex items-center gap-1 self-start text-xs font-medium text-red-600 hover:text-red-700">
          <Trash2 size={13} />
          Delete document
        </button>
      </div>

      {preview && <DocumentPreviewModal filename={preview.filename} mimeType={preview.mimeType} blobUrl={preview.blobUrl} onClose={closePreview} />}
      {compareWith && current && (
        <RevisionCompareModal
          projectId={projectId}
          documentId={document.id}
          revisionA={current}
          revisionB={document.revisions.find((r) => r.id === compareWith)!}
          onClose={() => setCompareWith(null)}
        />
      )}
    </div>
  );
}
