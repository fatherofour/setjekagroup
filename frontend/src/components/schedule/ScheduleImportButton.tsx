'use client';

import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

interface ImportResult {
  activitiesImported: number;
  dependenciesImported: number;
  dependenciesSkipped: number;
}

export function ScheduleImportButton({ projectId, onImported }: { projectId: string; onImported: () => void }) {
  const { authedFetch } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authedFetch<ImportResult>(`/projects/${projectId}/schedule/import/msproject`, { method: 'POST', formData });
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to import this file.');
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept=".xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <FileUp size={14} />
        {importing ? 'Importing…' : 'Import MS Project'}
      </button>
      {(result || error) && (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          {result && (
            <div className="space-y-1 text-slate-600 dark:text-slate-300">
              <p>
                Imported <strong>{result.activitiesImported}</strong> activities and <strong>{result.dependenciesImported}</strong> dependencies.
              </p>
              {result.dependenciesSkipped > 0 && (
                <p className="text-amber-600 dark:text-amber-400">
                  {result.dependenciesSkipped} dependency link{result.dependenciesSkipped === 1 ? '' : 's'} skipped (cyclic or unresolved).
                </p>
              )}
              <p className="text-slate-400 dark:text-slate-500">
                Critical path was recalculated by the platform, not read from the file.
              </p>
            </div>
          )}
          <button onClick={() => { setResult(null); setError(null); }} className="mt-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
