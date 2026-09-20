'use client';

import { useEffect } from 'react';
import { Download, FileWarning, X } from 'lucide-react';

interface DocumentPreviewModalProps {
  filename: string;
  mimeType: string | null;
  blobUrl: string;
  onClose: () => void;
}

// Renders inline for what browsers can natively display (images, PDF via
// <iframe>); everything else (Word/Excel — no in-browser renderer without
// sending the file to a third-party viewer, which isn't viable for a
// private, auth-gated document) falls back to a clear "download to view"
// message rather than a blank/broken preview.
export function DocumentPreviewModal({ filename, mimeType, blobUrl, onClose }: DocumentPreviewModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isImage = mimeType?.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{filename}</p>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={blobUrl}
              download={filename}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Download size={14} />
              Download
            </a>
            <button
              onClick={onClose}
              aria-label="Close preview"
              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950">
          {isImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={blobUrl} alt={filename} className="mx-auto max-h-[80vh] w-auto object-contain" />
          ) : isPdf ? (
            <iframe src={blobUrl} title={filename} className="h-[80vh] w-full border-0" />
          ) : (
            <div className="flex h-[40vh] flex-col items-center justify-center gap-2 text-center">
              <FileWarning size={28} className="text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Preview isn't available for this file type.</p>
              <a href={blobUrl} download={filename} className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
