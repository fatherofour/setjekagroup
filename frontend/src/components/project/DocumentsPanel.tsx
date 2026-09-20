'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Download, FileText, Folder as FolderIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { DocumentDetailPanel } from './DocumentDetailPanel';

interface DocumentFolder {
  id: string;
  parentId: string | null;
  name: string;
}

interface RevisionLite {
  id: string;
  revisionNumber: string;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
  uploadedAt: string;
  originalFilename: string;
  mimeType: string;
}

export interface ProjectDocument {
  id: string;
  name: string;
  description: string | null;
  documentType: string | null;
  discipline: string | null;
  folder: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  revisions: RevisionLite[];
}

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const REVIEW_BADGE: Record<RevisionLite['reviewStatus'], string> = {
  PENDING: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  APPROVED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  REVISION_REQUESTED: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
};

function currentRevision(doc: ProjectDocument): RevisionLite | undefined {
  return doc.revisions[0];
}

function toCsv(docs: ProjectDocument[]): string {
  const header = ['Name', 'Type', 'Discipline', 'Folder', 'Current revision', 'Review status', 'Created by', 'Created at'];
  const rows = docs.map((d) => {
    const rev = currentRevision(d);
    return [d.name, d.documentType ?? '', d.discipline ?? '', d.folder?.name ?? '', rev?.revisionNumber ?? '', rev?.reviewStatus ?? '', d.createdBy.fullName, d.createdAt];
  });
  return [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function AddDocumentForm({ projectId, folders, onAdded }: { projectId: string; folders: DocumentFolder[]; onAdded: () => void }) {
  const { authedFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [folderId, setFolderId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !file) return;
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      if (documentType.trim()) formData.append('documentType', documentType.trim());
      if (discipline.trim()) formData.append('discipline', discipline.trim());
      if (folderId) formData.append('folderId', folderId);
      formData.append('revisionNumber', 'A');
      formData.append('file', file);
      await authedFetch(`/projects/${projectId}/documents`, { method: 'POST', formData });
      setName('');
      setDocumentType('');
      setDiscipline('');
      setFolderId('');
      setFile(null);
      setOpen(false);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload document.');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800"
      >
        <Plus size={14} />
        Add document
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
      {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name" className={`${inputClass} flex-1`} />
        <input value={documentType} onChange={(e) => setDocumentType(e.target.value)} placeholder="Type (e.g. Drawing)" className={inputClass} />
        <input value={discipline} onChange={(e) => setDiscipline(e.target.value)} placeholder="Discipline" className={inputClass} />
        <Select
          value={folderId}
          onChange={setFolderId}
          className={inputClass}
          options={[{ value: '', label: '— No folder —' }, ...folders.map((f) => ({ value: f.id, label: f.name }))]}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-xs text-slate-600 dark:text-slate-300"
        />
        <button
          type="submit"
          disabled={saving || !name.trim() || !file}
          className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          {saving ? 'Uploading…' : 'Upload'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DocumentsPanel({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [documents, setDocuments] = useState<ProjectDocument[] | null>(null);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);

  const load = () => {
    authedFetch<ProjectDocument[]>(`/projects/${projectId}/documents`)
      .then(setDocuments)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load documents.'));
  };

  useEffect(() => {
    load();
    authedFetch<DocumentFolder[]>(`/projects/${projectId}/document-folders`).then(setFolders).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const types = useMemo(() => Array.from(new Set((documents ?? []).map((d) => d.documentType).filter(Boolean))) as string[], [documents]);
  const filtered = useMemo(
    () => (documents ?? []).filter((d) => !typeFilter || d.documentType === typeFilter),
    [documents, typeFilter],
  );

  function exportCsv() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'documents.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const openDoc = documents?.find((d) => d.id === openDocId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Documents</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={!documents || documents.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {types.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setTypeFilter(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${!typeFilter ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${typeFilter === t ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {documents === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No documents yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((d) => {
            const rev = currentRevision(d);
            return (
              <li key={d.id}>
                <button onClick={() => setOpenDocId(d.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <FileText size={14} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200">{d.name}</span>
                  {d.folder && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                      <FolderIcon size={11} />
                      {d.folder.name}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-slate-400">Rev {rev?.revisionNumber ?? '—'}</span>
                  {rev && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${REVIEW_BADGE[rev.reviewStatus]}`}>{rev.reviewStatus.replace('_', ' ')}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <AddDocumentForm projectId={projectId} folders={folders} onAdded={load} />

      {openDoc && (
        <DocumentDetailPanel
          projectId={projectId}
          document={openDoc}
          onClose={() => setOpenDocId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
