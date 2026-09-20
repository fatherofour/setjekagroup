'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { ContractorDetail } from '@/lib/contractors';
import { Select } from '@/components/ui/Select';

interface VendorScorecard {
  id: string;
  costScore: number;
  qualityScore: number;
  deliveryScore: number;
  safetyScore: number;
  documentationScore: number;
  overallScore: number;
  comment: string | null;
  createdAt: string;
  appointment: { project: { name: string } };
  recordedBy: { fullName: string };
}

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

const DIMENSIONS: { key: 'costScore' | 'qualityScore' | 'deliveryScore' | 'safetyScore' | 'documentationScore'; label: string }[] = [
  { key: 'costScore', label: 'Cost' },
  { key: 'qualityScore', label: 'Quality' },
  { key: 'deliveryScore', label: 'Delivery' },
  { key: 'safetyScore', label: 'Safety' },
  { key: 'documentationScore', label: 'Documentation' },
];

export function VendorScorecardPanel({ contractor }: { contractor: ContractorDetail }) {
  const { authedFetch } = useAuth();
  const [scorecards, setScorecards] = useState<VendorScorecard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [appointmentId, setAppointmentId] = useState('');
  const [scores, setScores] = useState({ costScore: 3, qualityScore: 3, deliveryScore: 3, safetyScore: 3, documentationScore: 3 });
  const [comment, setComment] = useState('');

  const load = async () => {
    try {
      setScorecards(await authedFetch<VendorScorecard[]>(`/contractors/${contractor.id}/scorecards`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load scorecards.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractor.id]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!appointmentId) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractor.id}/scorecards`, {
        method: 'POST',
        body: { appointmentId, ...scores, comment: comment.trim() || undefined },
      });
      setAppointmentId('');
      setComment('');
      setScores({ costScore: 3, qualityScore: 3, deliveryScore: 3, safetyScore: 3, documentationScore: 3 });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to record scorecard.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <ClipboardList size={14} />
        Vendor performance scorecard
      </h2>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {contractor.appointments.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">
          This organisation isn't associated with any project yet — add a project association first.
        </p>
      ) : scorecards === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : scorecards.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No scorecards recorded yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {scorecards.map((s) => (
            <li key={s.id} className="py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  {s.overallScore.toFixed(1)} / 5
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{s.appointment.project.name}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Cost {s.costScore} · Quality {s.qualityScore} · Delivery {s.deliveryScore} · Safety {s.safetyScore} · Docs {s.documentationScore}
              </p>
              {s.comment && <p className="mt-0.5 text-slate-700 dark:text-slate-200">{s.comment}</p>}
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {new Date(s.createdAt).toLocaleDateString()} · recorded by {s.recordedBy.fullName}
              </p>
            </li>
          ))}
        </ul>
      )}

      {contractor.appointments.length > 0 && (
        <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <Select
            value={appointmentId}
            onChange={setAppointmentId}
            options={[{ value: '', label: 'Select a project…' }, ...contractor.appointments.map((a) => ({ value: a.id, label: a.project.name }))]}
            className={`${inputClass} w-full`}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {DIMENSIONS.map((d) => (
              <div key={d.key}>
                <label className="text-xs text-slate-400 dark:text-slate-500">{d.label}</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  className={`${inputClass} w-full`}
                  value={scores[d.key]}
                  onChange={(e) => setScores({ ...scores, [d.key]: Number(e.target.value) })}
                />
              </div>
            ))}
          </div>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" className={`${inputClass} w-full`} />
          <button
            type="submit"
            disabled={saving || !appointmentId}
            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            Record scorecard
          </button>
        </form>
      )}
    </div>
  );
}
