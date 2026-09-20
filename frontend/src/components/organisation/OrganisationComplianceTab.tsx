'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { FilePlus, FileUp, Paperclip, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import type { ComplianceRecord } from '@/lib/contractors';
import {
  COMPUTED_STATUS_LABEL,
  COMPUTED_STATUS_TONE,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_LABEL,
  requiredDocumentTypes,
  type OrganisationClassification,
} from '@/lib/organisationMeta';
import { Select } from '@/components/ui/Select';
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal';

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OrganisationComplianceTab({
  contractorId,
  classifications,
  onChange,
}: {
  contractorId: string;
  classifications: OrganisationClassification[];
  onChange?: () => void;
}) {
  const { authedFetch, accessToken } = useAuth();
  const [records, setRecords] = useState<ComplianceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [preview, setPreview] = useState<{ filename: string; mimeType: string | null; blobUrl: string } | null>(null);

  const [documentType, setDocumentType] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('PENDING');

  const required = useMemo(() => requiredDocumentTypes(classifications), [classifications]);
  const uploadedTypes = useMemo(() => new Set((records ?? []).map((r) => r.documentType)), [records]);
  const verifiedCount = useMemo(
    () => required.filter((t) => (records ?? []).some((r) => r.documentType === t && r.verificationStatus === 'VERIFIED')).length,
    [records, required],
  );
  const uploadedCount = required.filter((t) => uploadedTypes.has(t)).length;

  const load = async () => {
    try {
      const data = await authedFetch<ComplianceRecord[]>(`/contractors/${contractorId}/compliance`);
      setRecords(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load compliance records.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractorId]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!documentType.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractorId}/compliance`, {
        method: 'POST',
        body: {
          documentType: documentType.trim(),
          documentNumber: documentNumber.trim() || undefined,
          issuingAuthority: issuingAuthority.trim() || undefined,
          issueDate: issueDate || undefined,
          expiryDate: expiryDate || undefined,
          verificationStatus,
        },
      });
      setDocumentType('');
      setDocumentNumber('');
      setIssuingAuthority('');
      setIssueDate('');
      setExpiryDate('');
      setVerificationStatus('PENDING');
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add compliance record.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/contractors/${contractorId}/compliance/${id}`, { method: 'DELETE' });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove compliance record.');
    }
  }

  async function handleFileSelected(recordId: string, file: File | undefined) {
    if (!file) return;
    setUploadingId(recordId);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await authedFetch(`/contractors/${contractorId}/compliance/${recordId}/document`, { method: 'POST', formData });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload document.');
    } finally {
      setUploadingId(null);
      const input = fileInputRefs.current[recordId];
      if (input) input.value = '';
    }
  }

  async function removeDocument(recordId: string) {
    try {
      await authedFetch(`/contractors/${contractorId}/compliance/${recordId}/document`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove the attached document.');
    }
  }

  async function viewDocument(record: ComplianceRecord) {
    try {
      const url = await apiFetchBlobUrl(`/contractors/${contractorId}/compliance/${record.id}/document`, accessToken);
      setPreview({ filename: record.attachmentFilename ?? record.documentType, mimeType: record.attachmentMimeType, blobUrl: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to open document.');
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.blobUrl);
    setPreview(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Compliance</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Required: <span className="font-medium text-slate-700 dark:text-slate-200">{required.length}</span> · Uploaded:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">{uploadedCount}</span> · Verified:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">{verifiedCount}</span>
        </p>
      </div>

      {required.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {required.map((t) => (
            <span
              key={t}
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                uploadedTypes.has(t)
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {records === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : records.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No compliance records yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {records.map((r) => (
            <li key={r.id} className="group/record flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{r.documentType}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {[r.documentNumber, r.issuingAuthority, r.expiryDate ? `expires ${new Date(r.expiryDate).toLocaleDateString()}` : null]
                    .filter(Boolean)
                    .join(' · ') || 'No details'}
                </p>
                {r.attachmentFilename ? (
                  <button
                    onClick={() => viewDocument(r)}
                    className="mt-1 flex items-center gap-1 text-xs text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    <Paperclip size={11} />
                    <span className="truncate">{r.attachmentFilename}</span>
                    {r.attachmentSize != null && <span className="text-slate-400 dark:text-slate-500">({formatBytes(r.attachmentSize)})</span>}
                  </button>
                ) : (
                  <p className="mt-1 text-xs text-slate-300 dark:text-slate-600">No document attached</p>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${COMPUTED_STATUS_TONE[r.computedStatus]}`}>
                {COMPUTED_STATUS_LABEL[r.computedStatus]}
              </span>

              <input
                ref={(el) => {
                  fileInputRefs.current[r.id] = el;
                }}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={(e) => handleFileSelected(r.id, e.target.files?.[0])}
              />
              <button
                onClick={() => fileInputRefs.current[r.id]?.click()}
                disabled={uploadingId === r.id}
                className="shrink-0 rounded p-1.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-emerald-700 group-hover/record:opacity-100 disabled:opacity-100 dark:hover:bg-slate-800"
                aria-label={r.attachmentFilename ? `Replace document for ${r.documentType}` : `Upload document for ${r.documentType}`}
                title={r.attachmentFilename ? 'Replace document' : 'Upload document'}
              >
                <FileUp size={14} />
              </button>
              {r.attachmentFilename && (
                <button
                  onClick={() => removeDocument(r.id)}
                  className="shrink-0 rounded p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/record:opacity-100 dark:hover:bg-red-950"
                  aria-label={`Remove attached document from ${r.documentType}`}
                  title="Remove attached document"
                >
                  <X size={14} />
                </button>
              )}
              <button
                onClick={() => remove(r.id)}
                className="shrink-0 rounded p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/record:opacity-100 dark:hover:bg-red-950"
                aria-label={`Remove ${r.documentType}`}
                title="Remove record"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          <input
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            placeholder="Document type (e.g. Tax Certificate)"
            list="compliance-doc-types"
            className={`${inputClass} flex-1`}
          />
          <datalist id="compliance-doc-types">
            {required.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} placeholder="Document number" className={`${inputClass} flex-1`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={issuingAuthority} onChange={(e) => setIssuingAuthority(e.target.value)} placeholder="Issuing authority" className={`${inputClass} flex-1`} />
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputClass} />
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={inputClass} />
          <Select value={verificationStatus} onChange={setVerificationStatus} options={VERIFICATION_STATUSES.map((s) => ({ value: s, label: VERIFICATION_STATUS_LABEL[s] }))} className={inputClass} />
        </div>
        <button
          type="submit"
          disabled={saving || !documentType.trim()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          <FilePlus size={13} />
          Add record
        </button>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Add the record, then use the upload icon on its row to attach the file (PDF, image, Word or Excel, up to 20MB). Stored on this
          server for now — a SharePoint sync can be added once the org provides Azure app credentials.
        </p>
      </form>

      {preview && (
        <DocumentPreviewModal filename={preview.filename} mimeType={preview.mimeType} blobUrl={preview.blobUrl} onClose={closePreview} />
      )}
    </div>
  );
}
