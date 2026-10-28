'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, EyeOff, FileSpreadsheet, FileText, Loader2, Presentation, Trash2, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';

type Kind = 'PROGRESS_PPTX' | 'SUMMARY_PDF' | 'EXCEL_EXPORT' | 'CLOSEOUT_PDF';

interface Report {
  id: string;
  kind: Kind;
  title: string;
  periodStart: string | null;
  periodEnd: string | null;
  sizeBytes: number;
  clientVisible: boolean;
  createdAt: string;
  generatedBy: { fullName: string };
}

const KINDS: { kind: Kind; label: string; format: string; description: string; icon: LucideIcon; defaultDays: number | null }[] = [
  { kind: 'PROGRESS_PPTX', label: 'Progress report', format: 'PowerPoint', description: "The client-facing report in Setjeka's own layout: executive summary, status detail, programme, cost, variations, risks, decisions, photos and priority actions. Fully editable before it goes out.", icon: Presentation, defaultDays: 7 },
  { kind: 'SUMMARY_PDF', label: 'Project summary', format: 'PDF', description: 'A summary across the project in figures and plain sentences, with no tables.', icon: FileText, defaultDays: 7 },
  { kind: 'EXCEL_EXPORT', label: 'Programme and registers', format: 'Excel', description: 'The programme, milestones, cost report, variations, risks, issues, RFIs, submittals, documents, site weather and delivery registers, a sheet each.', icon: FileSpreadsheet, defaultDays: 30 },
  { kind: 'CLOSEOUT_PDF', label: 'Close-out report', format: 'PDF', description: 'Completion, handover documents, defects, final accounts and the cost outcome (PROCSA PM 6.8, DM 6.9).', icon: FileText, defaultDays: null },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Reports (Meeting 3 §2.9). Setjeka generates them and chooses which the
 * client sees; `clientView` is the client's own list in the portal. */
export function ReportsPanel({ projectId, clientView = false }: { projectId: string; clientView?: boolean }) {
  const { authedFetch, accessToken, user } = useAuth();
  const internal = !clientView && (user?.accountType === 'INTERNAL' || user?.role === 'ADMIN');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Record<string, { from: string; to: string }>>(() =>
    Object.fromEntries(KINDS.map((k) => [k.kind, { from: k.defaultDays ? iso(new Date(Date.now() - k.defaultDays * 86_400_000)) : '', to: iso(new Date()) }])),
  );

  const load = useCallback(() => {
    authedFetch<Report[]>(`/projects/${projectId}/reports`)
      .then(setReports)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load reports'));
  }, [authedFetch, projectId]);

  useEffect(load, [load]);

  async function generate(kind: Kind) {
    setBusy(kind);
    setError(null);
    try {
      const p = periods[kind];
      const report = await authedFetch<Report>(`/projects/${projectId}/reports`, { method: 'POST', body: { kind, from: p.from || undefined, to: p.to || undefined } });
      setReports((r) => [report, ...(r ?? [])]);
      await download(report);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The report could not be generated');
    } finally {
      setBusy(null);
    }
  }

  async function download(r: Report) {
    const url = await apiFetchBlobUrl(`/projects/${projectId}/reports/${r.id}/file`, accessToken);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.title}.${r.kind === 'PROGRESS_PPTX' ? 'pptx' : r.kind === 'EXCEL_EXPORT' ? 'xlsx' : 'pdf'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function share(r: Report) {
    const updated = await authedFetch<Report>(`/projects/${projectId}/reports/${r.id}`, { method: 'PATCH', body: { clientVisible: !r.clientVisible } }).catch(() => null);
    if (updated) setReports((rs) => rs?.map((x) => (x.id === r.id ? updated : x)) ?? null);
  }

  async function remove(r: Report) {
    if (!window.confirm('Delete this report?')) return;
    await authedFetch(`/projects/${projectId}/reports/${r.id}`, { method: 'DELETE' }).catch(() => {});
    setReports((rs) => rs?.filter((x) => x.id !== r.id) ?? null);
  }

  const kindMeta = (k: Kind) => KINDS.find((x) => x.kind === k)!;

  return (
    <div className="space-y-4">
      {internal && (
        <div className="grid gap-3 md:grid-cols-2">
          {KINDS.map((k) => (
            <section key={k.kind} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-labelledby={`rk-${k.kind}`}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <k.icon size={18} />
                </span>
                <div className="min-w-0">
                  <h2 id={`rk-${k.kind}`} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {k.label} <span className="font-normal text-slate-400">· {k.format}</span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{k.description}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-1 flex-wrap items-end gap-2">
                <label className="text-xs text-slate-500">
                  From
                  <input
                    type="date"
                    className="mt-0.5 block h-9 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={periods[k.kind].from}
                    placeholder={k.defaultDays === null ? 'Project start' : undefined}
                    onChange={(e) => setPeriods({ ...periods, [k.kind]: { ...periods[k.kind], from: e.target.value } })}
                  />
                </label>
                <label className="text-xs text-slate-500">
                  To
                  <input
                    type="date"
                    className="mt-0.5 block h-9 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    value={periods[k.kind].to}
                    onChange={(e) => setPeriods({ ...periods, [k.kind]: { ...periods[k.kind], to: e.target.value } })}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => generate(k.kind)}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busy === k.kind && <Loader2 size={14} className="animate-spin" />}
                  {busy === k.kind ? 'Generating…' : 'Generate'}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" aria-labelledby="report-history">
        <h2 id="report-history" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {clientView ? 'Reports from Setjeka' : 'Generated reports'}
        </h2>
        {reports === null ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">{clientView ? 'Setjeka has not shared a report with you yet.' : 'No reports generated yet.'}</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {reports.map((r) => {
              const Icon = kindMeta(r.kind).icon;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Icon size={16} className="shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-100">{r.title}</p>
                    <p className="text-xs text-slate-500">
                      {kindMeta(r.kind).format} · {size(r.sizeBytes)} · {r.generatedBy.fullName}, {new Date(r.createdAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  {internal && (
                    <button
                      type="button"
                      onClick={() => share(r)}
                      aria-pressed={r.clientVisible}
                      className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium ${r.clientVisible ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      {r.clientVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                      {r.clientVisible ? 'Shared with client' : 'Share with client'}
                    </button>
                  )}
                  <button type="button" onClick={() => download(r)} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950">
                    <Download size={13} /> Download
                  </button>
                  {internal && (
                    <button type="button" onClick={() => remove(r)} aria-label="Delete report" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
