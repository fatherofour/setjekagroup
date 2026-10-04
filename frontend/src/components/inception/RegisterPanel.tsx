'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { memberLabel, type MemberRef } from '@/lib/inception';

export type FieldDef = {
  name: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'member' | 'document' | 'checkbox';
  options?: { value: string; label: string }[];
  suggestions?: string[];
  required?: boolean;
  placeholder?: string;
  wide?: boolean;
};

type Row = Record<string, unknown> & { id: string };

interface Props {
  // Used to load team members / documents for member and document fields.
  projectId?: string;
  register: string;
  // Defaults to the project's Stage 1 register; opportunities pass their own.
  basePath?: string;
  title: string;
  description: string;
  procsa?: string;
  fields: FieldDef[];
  // Which select field (if any) gets a quick-change dropdown on each row.
  statusField?: string;
  renderRow: (row: Row) => { primary: ReactNode; secondary?: ReactNode; badge?: ReactNode };
  addLabel?: string;
  emptyText?: string;
  onChange?: () => void;
}

const toInput = (field: FieldDef, value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (field.kind === 'date') return String(value).slice(0, 10);
  if (field.kind === 'checkbox') return value ? 'true' : '';
  return String(value);
};

/** One component for the Stage 1 registers (site constraints,
 * investigations, consents, information, required services). Field
 * definitions mirror the backend's register-fields specs. */
export function RegisterPanel({ projectId, register, basePath, title, description, procsa, fields, statusField, renderRow, addLabel = 'Add', emptyText = 'Nothing logged yet.', onChange }: Props) {
  const { authedFetch } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [members, setMembers] = useState<MemberRef[]>([]);
  const [documents, setDocuments] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const base = basePath ?? `/projects/${projectId}/inception/${register}`;
  const needsMembers = Boolean(projectId) && fields.some((f) => f.kind === 'member');
  const needsDocuments = Boolean(projectId) && fields.some((f) => f.kind === 'document');

  const load = () =>
    authedFetch<Row[]>(base)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load.'));

  useEffect(() => {
    load();
    if (needsMembers) authedFetch<MemberRef[]>(`/projects/${projectId}/members`).then(setMembers).catch(() => {});
    if (needsDocuments) authedFetch<{ id: string; name: string }[]>(`/projects/${projectId}/documents`).then(setDocuments).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const memberOptions = useMemo(() => [{ value: '', label: '—' }, ...members.map((m) => ({ value: m.id, label: memberLabel(m) }))], [members]);
  const documentOptions = useMemo(() => [{ value: '', label: '—' }, ...documents.map((d) => ({ value: d.id, label: d.name }))], [documents]);

  function open(row?: Row) {
    setError(null);
    setEditing(row ? row.id : 'new');
    setForm(Object.fromEntries(fields.map((f) => [f.name, row ? toInput(f, row[f.name]) : ''])));
  }

  function payload(): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = form[f.name] ?? '';
      if (f.kind === 'checkbox') body[f.name] = raw === 'true';
      else if (raw.trim() === '') body[f.name] = editing === 'new' ? undefined : null;
      else if (f.kind === 'number') body[f.name] = Number(raw);
      else body[f.name] = raw.trim();
    }
    return body;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing === 'new') await authedFetch(base, { method: 'POST', body: payload() });
      else await authedFetch(`${base}/${editing}`, { method: 'PATCH', body: payload() });
      setEditing(null);
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function quick(row: Row, body: Record<string, unknown>) {
    setError(null);
    try {
      await authedFetch(`${base}/${row.id}`, { method: 'PATCH', body });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update.');
    }
  }

  async function remove(row: Row) {
    if (!confirm('Delete this entry?')) return;
    setError(null);
    try {
      await authedFetch(`${base}/${row.id}`, { method: 'DELETE' });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete.');
    }
  }

  const statusDef = fields.find((f) => f.name === statusField);

  const renderField = (f: FieldDef) => {
    const id = `${register}-${f.name}`;
    const value = form[f.name] ?? '';
    const set = (v: string) => setForm((prev) => ({ ...prev, [f.name]: v }));
    let control: ReactNode;
    if (f.kind === 'textarea') {
      control = <textarea id={id} className={`${inputClass} h-20 resize-none py-2`} placeholder={f.placeholder} value={value} onChange={(e) => set(e.target.value)} />;
    } else if (f.kind === 'select' || f.kind === 'member' || f.kind === 'document') {
      const options = f.kind === 'member' ? memberOptions : f.kind === 'document' ? documentOptions : [{ value: '', label: '—' }, ...(f.options ?? [])];
      control = <Select id={id} aria-label={f.label} value={value} onChange={set} className={inputClass} options={options} />;
    } else if (f.kind === 'checkbox') {
      control = (
        <label className="flex h-9 items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input id={id} type="checkbox" className="h-4 w-4 accent-emerald-700" checked={value === 'true'} onChange={(e) => set(e.target.checked ? 'true' : '')} />
          {f.placeholder ?? 'Yes'}
        </label>
      );
    } else {
      control = (
        <>
          <input
            id={id}
            type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
            step={f.kind === 'number' ? 'any' : undefined}
            min={f.kind === 'number' ? 0 : undefined}
            list={f.suggestions ? `${id}-list` : undefined}
            className={inputClass}
            placeholder={f.placeholder}
            value={value}
            onChange={(e) => set(e.target.value)}
          />
          {f.suggestions && (
            <datalist id={`${id}-list`}>
              {f.suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      );
    }
    return (
      <div key={f.name} className={f.wide || f.kind === 'textarea' ? 'sm:col-span-2' : undefined}>
        {f.kind !== 'checkbox' && (
          <label className={labelClass} htmlFor={id}>
            {f.label}
            {f.required && <span className="text-red-500"> *</span>}
          </label>
        )}
        {f.kind === 'checkbox' && <p className={labelClass}>{f.label}</p>}
        {control}
      </div>
    );
  };

  const formBlock = (
    <form onSubmit={save} className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{fields.map(renderField)}</div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving || fields.some((f) => f.required && !(form[f.name] ?? '').trim())} className={primaryButton}>
          {saving ? 'Saving…' : editing === 'new' ? addLabel : 'Save'}
        </button>
        <button type="button" onClick={() => setEditing(null)} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
            {procsa && <span className="font-normal text-slate-400"> · PROCSA {procsa}</span>}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {editing === null && (
          <button type="button" onClick={() => open()} className={secondaryButton}>
            <Plus size={14} />
            {addLabel}
          </button>
        )}
      </div>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {editing === 'new' && formBlock}

      {rows === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : rows.length === 0 ? (
        editing !== 'new' && <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row) => {
            if (editing === row.id) return <li key={row.id}>{formBlock}</li>;
            const view = renderRow(row);
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 dark:text-slate-100">{view.primary}</div>
                  {view.secondary && <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{view.secondary}</div>}
                </div>
                {view.badge}
                {statusDef && (
                  <div className="w-40">
                    <Select
                      aria-label={`${statusDef.label} of entry`}
                      value={String(row[statusDef.name] ?? '')}
                      onChange={(v) => quick(row, { [statusDef.name]: v })}
                      className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      options={statusDef.options ?? []}
                    />
                  </div>
                )}
                <button type="button" aria-label="Edit" onClick={() => open(row)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                  <Pencil size={14} />
                </button>
                <button type="button" aria-label="Delete" onClick={() => remove(row)} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
