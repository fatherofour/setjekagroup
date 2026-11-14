'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ClipboardList, PenLine, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { DecisionDialog } from '@/components/signoff/DecisionDialog';
import { OUTCOME_LABEL, OUTCOME_TONE, type ApprovalOutcome } from '@/lib/signoff';
import { formatMoney, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { formatDate } from '@/lib/dates';

type FieldType = 'text' | 'longtext' | 'money' | 'int' | 'decimal' | 'date' | 'enum' | 'contractor' | 'member' | 'document';
interface Field {
  column: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Record<string, string>;
  inList?: boolean;
  hint?: string;
  unit?: string;
}
interface Definition {
  key: string;
  label: string;
  procsa: string;
  description: string;
  contractorsSee?: boolean;
  review?: { label: string; procsa: string };
  totals?: string[];
  fields: Field[];
}
interface Review {
  id: string;
  outcome: ApprovalOutcome;
  comment: string | null;
  signerName: string;
  signedAt: string;
}
interface Summary {
  key: string;
  count: number;
  canEdit: boolean;
  canDelete: boolean;
  canReview: boolean;
}
type Entry = Record<string, unknown> & {
  id: string;
  currency: string | null;
  contractor: { id: string; name: string } | null;
  responsible: { id: string; externalName: string | null; user: { fullName: string } | null } | null;
  document: { id: string; name: string } | null;
  reviewable?: boolean;
  /** Set when one consultant in particular reviews it (a valuation names its contract's). */
  reviewer?: string | null;
  canReviewThis?: boolean;
  reviews?: Review[];
};
type Option = { value: string; label: string };

function display(f: Field, e: Entry): string {
  const v = e[f.column];
  if (v == null || v === '') return '—';
  switch (f.type) {
    case 'money':
      return formatMoney(v as number, e.currency);
    case 'decimal':
      return `${(v as number).toLocaleString('en-GB', { maximumFractionDigits: 2 })}${f.unit ? ` ${f.unit}` : ''}`;
    case 'date':
      return formatDate(v as string);
    case 'enum':
      return f.options?.[v as string] ?? String(v);
    case 'contractor':
      return e.contractor?.name ?? '—';
    case 'member':
      return e.responsible?.user?.fullName ?? e.responsible?.externalName ?? '—';
    case 'document':
      return e.document?.name ?? '—';
    default:
      return String(v);
  }
}

const numeric = (f: Field) => f.type === 'money' || f.type === 'int' || f.type === 'decimal';
const toInput = (f: Field, v: unknown) => (v == null ? '' : f.type === 'date' ? String(v).slice(0, 10) : String(v));

/** The Stage 2 to 6 delivery registers (insurance, payment certificates,
 * handover and completion, defects, handover documents, claims, final
 * accounts, cash flow, finance, sales and leasing, procedures, service
 * agreements, and the architect's finishes and area schedules), all from one
 * definition served by the API. The architect keeps some and signs a review
 * of others (26 Oct 2026). */
export function RegistersPanel({ projectId, initial }: { projectId: string; initial?: string }) {
  const { authedFetch, user } = useAuth();
  const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
  const [defs, setDefs] = useState<Definition[] | null>(null);
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [reviewing, setReviewing] = useState<Entry | null>(null);
  const [visible, setVisible] = useState<string[] | null>(null);
  const [active, setActive] = useState<string | null>(initial ?? null);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [editing, setEditing] = useState<Entry | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contractors, setContractors] = useState<Option[]>([]);
  const [members, setMembers] = useState<Option[]>([]);
  const [documents, setDocuments] = useState<Option[]>([]);

  const loadSummary = useCallback(
    () =>
      authedFetch<Summary[]>(`/projects/${projectId}/delivery-registers`)
        .then((s) => {
          setSummary(Object.fromEntries(s.map((x) => [x.key, x])));
          setVisible(s.map((x) => x.key));
          setActive((a) => a ?? s[0]?.key ?? null);
        })
        .catch(() => {}),
    [authedFetch, projectId],
  );

  useEffect(() => {
    authedFetch<Definition[]>('/delivery/registers').then(setDefs).catch(() => setError('Could not load the registers'));
    loadSummary();
  }, [authedFetch, loadSummary]);

  const loadRows = useCallback(() => {
    if (!active) return;
    authedFetch<Entry[]>(`/projects/${projectId}/delivery-registers/${active}`)
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load the register'));
  }, [authedFetch, projectId, active]);

  useEffect(loadRows, [loadRows]);

  // Pickers, for whoever keeps a register (Setjeka, or the architect for
  // their own).
  const editsAny = Object.values(summary).some((x) => x.canEdit);
  useEffect(() => {
    if (!editsAny) return;
    // The company directory is Setjeka's; outside parties pick from the
    // contractors on this project.
    if (internal)
      authedFetch<unknown>('/contractors')
        .then((c) => {
          const list = (Array.isArray(c) ? c : ((c as { items?: unknown[]; data?: unknown[] }).items ?? (c as { data?: unknown[] }).data ?? [])) as { id: string; name: string }[];
          setContractors(list.map((x) => ({ value: x.id, label: x.name })));
        })
        .catch(() => {});
    authedFetch<{ id: string; externalName: string | null; user: { fullName: string } | null; role: string; contractor: { id: string; name: string } | null }[]>(`/projects/${projectId}/members`)
      .then((m) => {
        setMembers(m.map((x) => ({ value: x.id, label: x.user?.fullName ?? x.externalName ?? x.role })));
        if (!internal) setContractors([...new Map(m.filter((x) => x.contractor).map((x) => [x.contractor!.id, { value: x.contractor!.id, label: x.contractor!.name }])).values()]);
      })
      .catch(() => {});
    authedFetch<{ id: string; name: string }[]>(`/projects/${projectId}/documents`)
      .then((d) => setDocuments(d.map((x) => ({ value: x.id, label: x.name }))))
      .catch(() => {});
  }, [authedFetch, projectId, editsAny, internal]);

  const def = useMemo(() => defs?.find((d) => d.key === active) ?? null, [defs, active]);
  const rights = (active && summary[active]) || { canEdit: false, canDelete: false, canReview: false };
  const showReviews = Boolean(def?.review);
  const shown = defs?.filter((d) => !visible || visible.includes(d.key)) ?? [];

  function open(entry: Entry | 'new') {
    setError(null);
    setEditing(entry);
    if (!def) return;
    setForm(Object.fromEntries(def.fields.map((f) => [f.column, entry === 'new' ? (f.type === 'enum' && f.required ? Object.keys(f.options ?? {})[0] : '') : toInput(f, entry[f.column])])));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!def || !editing) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = form[f.column] ?? '';
      body[f.column] = v === '' ? null : numeric(f) ? Number(v) : v;
    }
    try {
      if (editing === 'new') await authedFetch(`/projects/${projectId}/delivery-registers/${def.key}`, { method: 'POST', body });
      else await authedFetch(`/projects/${projectId}/delivery-registers/${def.key}/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      loadRows();
      loadSummary();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    if (!def || !window.confirm('Delete this entry?')) return;
    await authedFetch(`/projects/${projectId}/delivery-registers/${def.key}/${entry.id}`, { method: 'DELETE' }).catch(() => {});
    loadRows();
    loadSummary();
  }

  const pickerOptions = (f: Field): Option[] =>
    f.type === 'enum' ? Object.entries(f.options ?? {}).map(([value, label]) => ({ value, label })) : f.type === 'contractor' ? contractors : f.type === 'member' ? members : documents;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Registers" className="rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Delivery registers</p>
        <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5 lg:overflow-visible">
          {shown.map((d) => (
            <li key={d.key} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActive(d.key);
                  setEditing(null);
                  setRows(null);
                }}
                aria-current={active === d.key}
                className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-left text-sm ${
                  active === d.key ? 'bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {d.label}
                <span className="text-xs tabular-nums text-slate-400">{summary[d.key]?.count ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {!def ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-900 dark:text-slate-100">
                  <ClipboardList size={16} /> {def.label}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{def.description}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                  PROCSA {def.procsa}
                  {def.review && ` · ${def.review.label}: ${def.review.procsa}`}
                </p>
              </div>
              {rights.canEdit && !editing && (
                <button type="button" onClick={() => open('new')} className={primaryButton}>
                  <Plus size={14} /> Add
                </button>
              )}
            </div>

            {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

            {editing && (
              <form onSubmit={save} className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{editing === 'new' ? `New entry` : 'Edit entry'}</p>
                  <button type="button" onClick={() => setEditing(null)} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <X size={15} />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {def.fields.map((f) => (
                    <div key={f.column} className={f.type === 'longtext' ? 'sm:col-span-2' : ''}>
                      <label className={labelClass} htmlFor={`f-${f.column}`}>
                        {f.label}
                        {f.required && <span className="text-red-500"> *</span>}
                      </label>
                      {f.type === 'longtext' ? (
                        <textarea id={`f-${f.column}`} className={`${inputClass} h-20 py-2`} value={form[f.column] ?? ''} onChange={(e) => setForm({ ...form, [f.column]: e.target.value })} />
                      ) : f.type === 'enum' || f.type === 'contractor' || f.type === 'member' || f.type === 'document' ? (
                        <Select
                          id={`f-${f.column}`}
                          aria-label={f.label}
                          className={inputClass}
                          value={form[f.column] ?? ''}
                          onChange={(v) => setForm({ ...form, [f.column]: v })}
                          options={[...(f.required && f.type === 'enum' ? [] : [{ value: '', label: '—' }]), ...pickerOptions(f)]}
                        />
                      ) : (
                        <input
                          id={`f-${f.column}`}
                          className={inputClass}
                          type={f.type === 'date' ? 'date' : numeric(f) ? 'number' : 'text'}
                          step={f.type === 'money' || f.type === 'decimal' ? 'any' : undefined}
                          placeholder={f.hint ?? f.unit}
                          value={form[f.column] ?? ''}
                          onChange={(e) => setForm({ ...form, [f.column]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="submit" disabled={busy} className={primaryButton}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {rows === null ? (
              <p className="mt-4 text-sm text-slate-400">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">Nothing recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      {def.fields
                        .filter((f) => f.inList)
                        .map((f) => (
                          <th key={f.column} className={`px-2 py-2 font-medium ${numeric(f) ? 'text-right' : ''}`}>
                            {f.label}
                          </th>
                        ))}
                      {showReviews && <th className="px-2 py-2 font-medium">{def.review!.label}</th>}
                      {(rights.canEdit || rights.canDelete) && <th className="w-16" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r) => (
                      <tr key={r.id} className="text-slate-700 dark:text-slate-200">
                        {def.fields
                          .filter((f) => f.inList)
                          .map((f) => (
                            <td key={f.column} className={`px-2 py-2 ${numeric(f) ? 'text-right tabular-nums' : ''}`}>
                              {display(f, r)}
                            </td>
                          ))}
                        {showReviews && (
                          <td className="px-2 py-2 align-top text-xs">
                            {r.reviews?.[0] ? (
                              <span title={r.reviews[0].comment ?? undefined}>
                                <span className={`rounded-full px-2 py-0.5 font-medium ${OUTCOME_TONE[r.reviews[0].outcome]}`}>{OUTCOME_LABEL[r.reviews[0].outcome]}</span>
                                <span className="mt-0.5 block text-slate-500">
                                  {r.reviews[0].signerName}, {new Date(r.reviews[0].signedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                                </span>
                              </span>
                            ) : r.reviewable ? (
                              <span className="text-slate-400">Not yet reviewed{r.reviewer ? ` (for the ${r.reviewer})` : ''}</span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                            {rights.canReview && r.reviewable && r.canReviewThis !== false && (
                              <button type="button" onClick={() => setReviewing(r)} className="mt-1 flex items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                                <PenLine size={12} /> {r.reviews?.length ? 'Review again' : 'Review and sign'}
                              </button>
                            )}
                          </td>
                        )}
                        {(rights.canEdit || rights.canDelete) && (
                          <td className="whitespace-nowrap px-2 py-2 text-right">
                            {rights.canEdit && (
                              <button type="button" onClick={() => open(r)} aria-label="Edit" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                                <Pencil size={13} />
                              </button>
                            )}
                            {rights.canDelete && (
                              <button type="button" onClick={() => remove(r)} aria-label="Delete" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {def.totals && rows.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 font-semibold text-slate-800 dark:border-slate-700 dark:text-slate-100">
                        {def.fields
                          .filter((f) => f.inList)
                          .map((f, i) => {
                            // A column nobody has filled in totals to a dash, not a zero.
                            const sum = def.totals!.includes(f.column) && rows.some((r) => r[f.column] != null) ? rows.reduce((t, r) => t + (Number(r[f.column]) || 0), 0) : null;
                            return (
                              <td key={f.column} className={`px-2 py-2 ${numeric(f) ? 'text-right tabular-nums' : ''}`}>
                                {sum !== null ? display(f, { ...rows[0], [f.column]: sum }) : i === 0 ? 'Total' : ''}
                              </td>
                            );
                          })}
                        {showReviews && <td />}
                        {(rights.canEdit || rights.canDelete) && <td />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {reviewing && def?.review && (
        <DecisionDialog
          projectId={projectId}
          title={`${def.review.label}: ${def.label}`}
          context={def.fields
            .filter((f) => f.inList)
            .map((f) => `${f.label}: ${display(f, reviewing)}`)
            .join(' · ')}
          endpoint={`/projects/${projectId}/delivery-registers/${def.key}/${reviewing.id}/review`}
          subjectId={reviewing.id}
          onClose={() => setReviewing(null)}
          onDecided={() => {
            setReviewing(null);
            loadRows();
          }}
        >
          {reviewing.document && <p className="text-xs text-slate-500">Your signature is added to {reviewing.document.name}, with a sign-off page.</p>}
        </DecisionDialog>
      )}
    </div>
  );
}
