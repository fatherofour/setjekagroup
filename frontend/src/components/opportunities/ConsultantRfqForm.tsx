'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { inputClass, labelClass, primaryButton, secondaryButton } from '@/lib/stage0';
import { ratingText, type EligibleConsultant } from './consultantTypes';

interface Props {
  // Where RFQs are created: "/opportunities/<id>/rfqs" or "/projects/<id>/consultant-rfqs".
  basePath: string;
  contextName: string;
  // The project's procurement policy split, when there is one.
  defaultPriceWeight?: number;
  onCreated: () => void;
  onCancel: () => void;
}

/** Pick a discipline -> every registered firm in it is listed and ticked,
 * because the default at Stage 0 is to go to the whole panel. Untick any you
 * don't want to approach. */
export function ConsultantRfqForm({ basePath, contextName, defaultPriceWeight = 60, onCreated, onCancel }: Props) {
  const { authedFetch } = useAuth();
  const [disciplines, setDisciplines] = useState<{ discipline: string; count: number }[] | null>(null);
  const [discipline, setDiscipline] = useState('');
  const [consultants, setConsultants] = useState<EligibleConsultant[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priceWeight, setPriceWeight] = useState(defaultPriceWeight);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<{ discipline: string; count: number }[]>('/consultants/disciplines')
      .then(setDisciplines)
      .catch(() => setDisciplines([]));
  }, [authedFetch]);

  function chooseDiscipline(next: string) {
    setDiscipline(next);
    setConsultants(null);
    setSelected(new Set());
    if (!next) return;
    setTitle(`${next} appointment — ${contextName}`);
    authedFetch<EligibleConsultant[]>(`/consultants?discipline=${encodeURIComponent(next)}`)
      .then((list) => {
        setConsultants(list);
        setSelected(new Set(list.map((c) => c.id)));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load consultants.'));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(issue: boolean, e?: FormEvent) {
    e?.preventDefault();
    if (!discipline || selected.size === 0 || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(basePath, {
        method: 'POST',
        body: {
          title: title.trim(),
          discipline,
          scopeDescription: scope.trim() || undefined,
          dueDate: dueDate || undefined,
          priceWeight,
          ratingWeight: 100 - priceWeight,
          contractorIds: [...selected],
          issue,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create RFQ.');
    } finally {
      setSaving(false);
    }
  }

  const noPortal = consultants?.filter((c) => selected.has(c.id) && !c.hasPortalAccess).length ?? 0;

  return (
    <form onSubmit={(e) => submit(true, e)} className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <div>
        <label className={labelClass} htmlFor="rfq-discipline">
          Which consultant do you need?
        </label>
        {disciplines === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : disciplines.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No consultants are registered with a discipline yet. Add disciplines to firms under Procurement → Contractors.
          </p>
        ) : (
          <div className="max-w-sm">
            <Select
              id="rfq-discipline"
              value={discipline}
              onChange={chooseDiscipline}
              className={inputClass}
              options={[
                { value: '', label: 'Choose a discipline…' },
                ...disciplines.map((d) => ({ value: d.discipline, label: `${d.discipline} (${d.count} registered)` })),
              ]}
            />
          </div>
        )}
      </div>

      {discipline && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className={labelClass}>
              Send to — {selected.size} of {consultants?.length ?? 0} registered {discipline.toLowerCase()}s selected
            </p>
            {consultants && consultants.length > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                onClick={() => setSelected(selected.size === consultants.length ? new Set() : new Set(consultants.map((c) => c.id)))}
              >
                {selected.size === consultants.length ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>
          {consultants === null ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : consultants.length === 0 ? (
            <p className="text-sm text-slate-500">No eligible firms registered for this discipline.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
              {consultants.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-emerald-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {[c.city, c.prequalificationStatus === 'PREQUALIFIED' ? 'Prequalified' : null].filter(Boolean).join(' · ') || ' '}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs ${c.rating.average === null ? 'text-slate-400' : 'font-medium text-amber-600 dark:text-amber-400'}`}>
                      {ratingText(c.rating)}
                    </span>
                    {c.hasPortalAccess && (
                      <span title="Can quote through the vendor portal" className="shrink-0 text-emerald-600 dark:text-emerald-400">
                        <KeyRound size={13} />
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {noPortal > 0 && (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {noPortal} selected {noPortal === 1 ? 'firm has' : 'firms have'} no portal login — send them the RFQ directly and record their quote here when it arrives.
            </p>
          )}
        </div>
      )}

      {discipline && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="rfq-title">
              RFQ title
            </label>
            <input id="rfq-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="rfq-scope">
              Scope of services
            </label>
            <textarea
              id="rfq-scope"
              className={`${inputClass} h-20 resize-none py-2`}
              placeholder="e.g. Full architectural services, concept through construction documentation"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="rfq-due">
              Quotes due by
            </label>
            <input id="rfq-due" type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="rfq-weight">
              Evaluation: price {priceWeight}% · track record {100 - priceWeight}%
            </label>
            <input
              id="rfq-weight"
              type="range"
              min={0}
              max={100}
              step={5}
              value={priceWeight}
              onChange={(e) => setPriceWeight(Number(e.target.value))}
              className="mt-2 w-full accent-emerald-700"
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !discipline || selected.size === 0 || !title.trim()} className={primaryButton}>
          <Send size={14} />
          {saving ? 'Sending…' : `Send RFQ to ${selected.size} ${selected.size === 1 ? 'firm' : 'firms'}`}
        </button>
        <button type="button" disabled={saving || !discipline || selected.size === 0} onClick={() => submit(false)} className={secondaryButton}>
          Save as draft
        </button>
        <button type="button" onClick={onCancel} className={secondaryButton}>
          Cancel
        </button>
      </div>
    </form>
  );
}
