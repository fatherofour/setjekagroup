'use client';

import { useSearchParams } from 'next/navigation';
import { DocumentSearch } from '@/components/files/DocumentSearch';

export default function SearchPage() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Search documents</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Search the text of documents and drawings on every project you work on.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <DocumentSearch key={q} initialQuery={q} autoFocus />
      </div>
    </div>
  );
}
