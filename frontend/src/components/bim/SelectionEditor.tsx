'use client';

import { useEffect, useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Select } from '@/components/ui/Select';
import { inputCls, selectCls } from '@/lib/architect';
import { BASE_FIELDS, NO_VALUE, OP_LABEL, ifcLabel, type Condition, type Op, type Selection } from '@/lib/bim';

export interface Vocabulary {
  models: { id: string; name: string }[];
  types: string[];
  storeys: string[];
  fields: string[];
}

const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`;
const toggle = (list: string[] | undefined, v: string) => (list?.includes(v) ? list.filter((x) => x !== v) : [...(list ?? []), v]);

/** Conditions on element fields, properties and quantities. */
export function ConditionsEditor({ value, onChange, fields, addLabel = 'Add a condition' }: { value: Condition[]; onChange: (c: Condition[]) => void; fields: string[]; addLabel?: string }) {
  const listId = useId();
  const set = (i: number, patch: Partial<Condition>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="space-y-1.5">
      <datalist id={listId}>
        {BASE_FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
        {fields.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {value.map((c, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5">
          <input className={`${inputCls} h-8 text-xs`} list={listId} value={c.field} onChange={(e) => set(i, { field: e.target.value })} placeholder="property:Pset_WallCommon.FireRating" aria-label="Field" />
          <Select className={`${selectCls} h-8 w-full text-xs`} value={c.op} onChange={(v) => set(i, { op: v as Op })} options={(Object.keys(OP_LABEL) as Op[]).map((o) => ({ value: o, label: OP_LABEL[o] }))} aria-label="Test" />
          <input className={`${inputCls} h-8 text-xs disabled:opacity-40`} value={c.value ?? ''} disabled={NO_VALUE.includes(c.op)} onChange={(e) => set(i, { value: e.target.value })} placeholder="value" aria-label="Value" />
          <button type="button" aria-label="Remove condition" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => onChange([...value, { field: 'name', op: 'contains', value: '' }])}>
        <Plus size={12} /> {addLabel}
      </button>
      <p className="text-[11px] text-slate-400">Fields: name, typeName, storey, material, ifcType, or property:Set.Name / quantity:Set.Name (suggested as you type).</p>
    </div>
  );
}

/** Which elements: models, IFC classes, storeys and conditions - with a
 * live count of what it picks. */
export function SelectionEditor({ projectId, value, onChange, vocab, compact = false }: { projectId: string; value: Selection; onChange: (s: Selection) => void; vocab: Vocabulary; compact?: boolean }) {
  const { authedFetch } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  const [showAllTypes, setShowAllTypes] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const clean = { ...value, conditions: (value.conditions ?? []).filter((c) => c.field.trim()) };
      authedFetch<{ count: number }>(`/projects/${projectId}/bim/smart-views/preview`, { method: 'POST', body: clean })
        .then((r) => live && setCount(r.count))
        .catch(() => live && setCount(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [authedFetch, projectId, value]);

  const types = showAllTypes ? vocab.types : vocab.types.slice(0, 14);
  return (
    <div className="space-y-2">
      {vocab.models.length > 1 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Models (none chosen = all)</p>
          <div className="flex flex-wrap gap-1.5">
            {vocab.models.map((m) => (
              <button key={m.id} type="button" aria-pressed={value.documentIds?.includes(m.id) ?? false} className={chip(value.documentIds?.includes(m.id) ?? false)} onClick={() => onChange({ ...value, documentIds: toggle(value.documentIds, m.id) })}>
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">IFC classes (none chosen = all)</p>
        <div className="flex flex-wrap gap-1.5">
          {types.map((t) => {
            const on = value.ifcTypes?.some((x) => x.toLowerCase() === t.toLowerCase()) ?? false;
            return (
              <button key={t} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange({ ...value, ifcTypes: on ? value.ifcTypes!.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...(value.ifcTypes ?? []), t] })}>
                {ifcLabel(t)}
              </button>
            );
          })}
          {vocab.types.length > 14 && (
            <button type="button" className="text-xs text-emerald-700 hover:underline dark:text-emerald-400" onClick={() => setShowAllTypes((v) => !v)}>
              {showAllTypes ? 'Fewer' : `All ${vocab.types.length}`}
            </button>
          )}
        </div>
      </div>
      {!compact && vocab.storeys.length > 0 && (
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">Storeys (none chosen = all)</p>
          <div className="flex flex-wrap gap-1.5">
            {vocab.storeys.map((s) => (
              <button key={s} type="button" aria-pressed={value.storeys?.includes(s) ?? false} className={chip(value.storeys?.includes(s) ?? false)} onClick={() => onChange({ ...value, storeys: toggle(value.storeys, s) })}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">And where</p>
        <ConditionsEditor value={value.conditions ?? []} onChange={(conditions) => onChange({ ...value, conditions })} fields={vocab.fields} />
      </div>
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300" aria-live="polite">
        {count === null ? 'Counting…' : `${count.toLocaleString('en-ZA')} element${count === 1 ? '' : 's'} picked`}
      </p>
    </div>
  );
}
