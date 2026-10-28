'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, FileUp, ListChecks, Loader2, XCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardCls, primaryBtn, secondaryBtn } from '@/lib/architect';

interface Result {
  source: string;
  expected: number;
  onRegister: number;
  matched: { number: string; title: string | null; documentId: string; expectedRevision: string | null; registerRevision: string | null; revisionMatches: boolean }[];
  revisionMismatches: Result['matched'];
  missing: { number: string; title: string | null; revision: string | null }[];
  extra: { id: string; number: string; title: string; revision: string | null }[];
}

/** Drawing index reconciliation: the architect's issued drawing index (a
 * PDF, Excel or CSV list, or pasted) checked against the register - what is
 * listed but not here, what is here but not listed, and which revisions
 * differ. */
export function IndexCheck({ projectId }: { projectId: string }) {
  const { authedFetch } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function check(file?: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    if (file) fd.append('file', file);
    else fd.append('text', text);
    try {
      setResult(await authedFetch<Result>(`/projects/${projectId}/drawings/index-check`, { method: 'POST', formData: fd }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The index could not be checked.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const ok = result && !result.missing.length && !result.extra.length && !result.revisionMismatches.length;

  return (
    <section className={`${cardCls} p-4`}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <ListChecks size={15} />
        Check a drawing index against the register
      </h2>
      <p className="mt-0.5 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
        Upload the index sheet or schedule the architect issued (PDF, Excel or CSV), or paste the list - one drawing per line, number first and the revision last if it is shown. Numbers are matched however they are spaced or punctuated.
      </p>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={'2145-ARC-DWG-101  Ground floor plan  C\n2145-ARC-DWG-102  First floor plan  B'}
          aria-label="Paste the drawing list"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="flex flex-row gap-2 lg:flex-col">
          <button type="button" className={primaryBtn} disabled={busy || !text.trim()} onClick={() => check()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />}
            Check pasted list
          </button>
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileUp size={14} />
            Upload index file
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.xlsx,.csv,.txt" className="hidden" aria-label="Choose drawing index" onChange={(e) => e.target.files?.[0] && check(e.target.files[0])} />
        </div>
      </div>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {ok ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 size={13} />
                The register matches the index
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <XCircle size={13} />
                Differences found
              </span>
            )}
            <span className="text-slate-500">
              {result.source}: {result.expected} listed · {result.onRegister} on the register · {result.matched.length} matched
            </span>
          </div>
          <Group title={`Listed on the index but not on the register (${result.missing.length})`} tone="red" empty="None - every listed drawing is on the register.">
            {result.missing.map((m) => (
              <li key={m.number}>
                <span className="font-mono font-semibold">{m.number}</span> {m.title && <span className="text-slate-500">· {m.title}</span>} {m.revision && <span className="text-slate-500">· rev {m.revision}</span>}
              </li>
            ))}
          </Group>
          <Group title={`Revision differs (${result.revisionMismatches.length})`} tone="amber" empty="None - the revisions agree.">
            {result.revisionMismatches.map((m) => (
              <li key={m.number}>
                <span className="font-mono font-semibold">{m.number}</span> <span className="text-slate-500">· index says rev {m.expectedRevision}, register has rev {m.registerRevision}</span>
              </li>
            ))}
          </Group>
          <Group title={`On the register but not on the index (${result.extra.length})`} tone="slate" empty="None.">
            {result.extra.map((m) => (
              <li key={m.id}>
                <span className="font-mono font-semibold">{m.number}</span> <span className="text-slate-500">· {m.title}</span>
              </li>
            ))}
          </Group>
        </div>
      )}
    </section>
  );
}

function Group({ title, tone, empty, children }: { title: string; tone: 'red' | 'amber' | 'slate'; empty: string; children: React.ReactNode[] }) {
  const bar = { red: 'border-red-400', amber: 'border-amber-400', slate: 'border-slate-300 dark:border-slate-600' }[tone];
  return (
    <div className={`border-l-2 pl-3 ${bar}`}>
      <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {children.length ? <ul className="mt-1 space-y-0.5 text-xs text-slate-700 dark:text-slate-200">{children}</ul> : <p className="mt-1 text-xs text-slate-400">{empty}</p>}
    </div>
  );
}
