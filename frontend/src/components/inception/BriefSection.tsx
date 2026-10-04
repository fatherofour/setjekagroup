'use client';

import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { cardClass, inputClass, labelClass, primaryButton } from '@/lib/stage0';
import { CommentThread } from '@/components/project/CommentThread';

const SECTIONS: { name: string; label: string; hint: string; required?: boolean }[] = [
  { name: 'clientRequirements', label: 'Client requirements & preferences', hint: 'What the client has asked for, in their words', required: true },
  { name: 'userNeeds', label: 'User needs', hint: 'Who will use the building and what they need from it' },
  { name: 'optionsConsidered', label: 'Options assessed', hint: 'Alternatives considered and why they were or weren’t taken forward' },
  { name: 'objectives', label: 'Project objectives', hint: 'Measurable outcomes the project must deliver', required: true },
  { name: 'priorities', label: 'Priorities', hint: 'e.g. programme over cost, quality over speed' },
  { name: 'constraints', label: 'Constraints', hint: 'Site, budget, programme, statutory and other limits', required: true },
  { name: 'assumptions', label: 'Assumptions', hint: 'What the brief takes as given' },
  { name: 'aspirations', label: 'Aspirations', hint: 'Design ambitions, e.g. Green Star rating, landmark quality' },
  { name: 'strategies', label: 'Strategies', hint: 'Delivery, phasing, funding or marketing strategies' },
];

type Brief = Record<string, string | number | null> & { budgetTarget?: number | null; targetCompletion?: string | null };

/** PROCSA DM 1.1 "Formalise project brief" / PM 1.1 / every consultant's
 * 1.1 "Assist in developing a clear project brief" — the brief itself,
 * with the consultants' input as a discussion thread underneath. */
export function BriefSection({ projectId, currency, onChange }: { projectId: string; currency: string; onChange?: () => void }) {
  const { authedFetch } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<Brief>(`/projects/${projectId}/inception/brief`)
      .then((b) => {
        setForm({
          ...Object.fromEntries(SECTIONS.map((s) => [s.name, String(b[s.name] ?? '')])),
          budgetTarget: b.budgetTarget != null ? String(b.budgetTarget) : '',
          targetCompletion: b.targetCompletion ? String(b.targetCompletion).slice(0, 10) : '',
        });
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load the brief.'));
  }, [authedFetch, projectId]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await authedFetch(`/projects/${projectId}/inception/brief`, {
        method: 'PUT',
        body: {
          ...Object.fromEntries(SECTIONS.map((s) => [s.name, form[s.name]?.trim() || null])),
          budgetTarget: form.budgetTarget ? Number(form.budgetTarget) : null,
          targetCompletion: form.targetCompletion || null,
        },
      });
      setSaved(true);
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save the brief.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <FileText size={14} />
          Project brief <span className="font-normal text-slate-400">· PROCSA DM 1.1 · PM 1.1 · consultants 1.1</span>
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Client requirements and preferences, user needs and options, and the project objectives, priorities, constraints, assumptions, aspirations and strategies. Saving an approved brief starts a new version for the client to approve.
        </p>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {!loaded ? (
          <p className="mt-3 text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="brief-budget">
                  Budget target ({currency})
                </label>
                <input id="brief-budget" type="number" min={0} className={inputClass} value={form.budgetTarget ?? ''} onChange={(e) => setForm({ ...form, budgetTarget: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="brief-completion">
                  Target completion
                </label>
                <input id="brief-completion" type="date" className={inputClass} value={form.targetCompletion ?? ''} onChange={(e) => setForm({ ...form, targetCompletion: e.target.value })} />
              </div>
            </div>
            {SECTIONS.map((s) => (
              <div key={s.name}>
                <label className={labelClass} htmlFor={`brief-${s.name}`}>
                  {s.label}
                  {s.required && <span className="text-red-500"> *</span>}
                </label>
                <textarea
                  id={`brief-${s.name}`}
                  className={`${inputClass} h-20 resize-y py-2`}
                  placeholder={s.hint}
                  value={form[s.name] ?? ''}
                  onChange={(e) => {
                    setForm({ ...form, [s.name]: e.target.value });
                    setSaved(false);
                  }}
                />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={saving} className={primaryButton}>
                {saving ? 'Saving…' : 'Save brief'}
              </button>
              {saved && <span className="text-xs text-emerald-700 dark:text-emerald-400">Saved</span>}
            </div>
          </div>
        )}
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Consultant input on the brief</h2>
        <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
          The architect, QS and engineers comment here; their input counts toward their PROCSA 1.1. Mention someone with @Full Name.
        </p>
        <CommentThread projectId={projectId} entityType="PROJECT_BRIEF" entityId={projectId} />
      </div>
    </div>
  );
}
