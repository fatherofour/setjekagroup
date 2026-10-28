'use client';

import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { FileSearch, FileText, Loader2, ScanText, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { DocumentPreviewModal } from '@/components/ui/DocumentPreviewModal';
import type { SearchHit, SearchResult } from '@/lib/files';

/** The search engine marks matches «like this». */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('«') ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 text-slate-900 dark:bg-amber-900/60 dark:text-amber-50">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** Search inside the documents and drawings - the text of every PDF page,
 * read from the file or by OCR from a scan - and by name and number. Scoped
 * to one project, or across every project the user can see. */
export function DocumentSearch({ projectId, initialQuery = '', autoFocus = false, onOpenDocument }: { projectId?: string; initialQuery?: string; autoFocus?: boolean; onOpenDocument?: (documentId: string) => void }) {
  const { authedFetch, accessToken } = useAuth();
  const [q, setQ] = useState(initialQuery);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ filename: string; blobUrl: string } | null>(null);
  const ran = useRef(false);

  async function run(query: string) {
    if (query.trim().length < 2) {
      setError('Type at least two characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const path = projectId ? `/projects/${projectId}/documents/search` : '/documents/search';
      setResult(await authedFetch<SearchResult>(`${path}?q=${encodeURIComponent(query.trim())}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The search failed.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialQuery && !ran.current) {
      ran.current = true;
      void run(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(q);
  }

  async function openPage(h: SearchHit, page: number) {
    if (!h.revisionId) return;
    try {
      const url = await apiFetchBlobUrl(`/projects/${h.projectId}/documents/${h.documentId}/revisions/${h.revisionId}/file`, accessToken);
      setPreview({ filename: h.name, blobUrl: `${url}#page=${page}` });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not open the file.');
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex gap-2" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search inside documents</span>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus={autoFocus}
            placeholder={projectId ? 'Search inside this project’s documents and drawings…' : 'Search inside documents on all your projects…'}
            className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <button type="submit" disabled={busy} className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileSearch size={14} />}
          Search
        </button>
      </form>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Finds words on any page of a PDF, including scanned drawings (read by OCR). Use quotes for a phrase and - to leave a word out.</p>
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {result && (
        <div className="mt-3" aria-live="polite">
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            {result.results.length === 0 ? `Nothing found for “${result.query}”.` : `${result.results.length} document${result.results.length === 1 ? '' : 's'} for “${result.query}”.`}
            {result.stillReading ? ` ${result.stillReading} file${result.stillReading === 1 ? ' is' : 's are'} still being read, so try again shortly for those.` : ''}
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {result.results.map((h) => (
              <li key={h.documentId} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <FileText size={14} className="shrink-0 text-slate-400" />
                  {onOpenDocument ? (
                    <button onClick={() => onOpenDocument(h.documentId)} className="text-left text-sm font-medium text-slate-800 hover:text-emerald-700 hover:underline dark:text-slate-100">
                      {h.drawingNumber ? `${h.drawingNumber} · ` : ''}
                      {h.name}
                    </button>
                  ) : (
                    <Link href={`/projects/${h.projectId}?tab=documents&doc=${h.documentId}`} className="text-sm font-medium text-slate-800 hover:text-emerald-700 hover:underline dark:text-slate-100">
                      {h.drawingNumber ? `${h.drawingNumber} · ` : ''}
                      {h.name}
                    </Link>
                  )}
                  {h.revisionNumber && <span className="text-xs text-slate-400">Rev {h.revisionNumber}</span>}
                  {!h.latest && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">older revision</span>}
                  {!projectId && <span className="text-xs text-slate-400">· {h.projectName}</span>}
                  {h.matchedName && h.pages.length === 0 && <span className="text-xs text-slate-400">matched by name</span>}
                </div>
                {h.pages.map((p) => (
                  <button key={p.page} onClick={() => openPage(h, p.page)} className="mt-1 block w-full rounded-md px-2 py-1 text-left text-xs text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50">
                    <span className="mr-1.5 inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
                      Page {p.page}
                      {p.source === 'OCR' && (
                        <span title="Read from a scan by OCR" className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-[10px] dark:bg-slate-800">
                          <ScanText size={10} />
                          OCR
                        </span>
                      )}
                    </span>
                    <Snippet text={p.snippet} />
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {preview && (
        <DocumentPreviewModal
          filename={preview.filename}
          mimeType="application/pdf"
          blobUrl={preview.blobUrl}
          onClose={() => {
            URL.revokeObjectURL(preview.blobUrl.split('#')[0]);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
