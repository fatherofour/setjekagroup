'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Info, Trash2, UserSquare2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import type { ContractorDetail, OrganisationRating } from '@/lib/contractors';
import { RATER_TYPES, RATER_TYPE_LABEL, type RaterType } from '@/lib/organisationMeta';
import { Select } from '@/components/ui/Select';
import { StarRating } from '@/components/ui/StarRating';

const inputClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

export function OrganisationRatingsTab({ contractor, onChange }: { contractor: ContractorDetail; onChange?: () => void }) {
  const { authedFetch } = useAuth();
  const [ratings, setRatings] = useState<OrganisationRating[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [appointmentId, setAppointmentId] = useState('');
  const [raterType, setRaterType] = useState<RaterType>('INTERNAL');
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  const load = async () => {
    try {
      const data = await authedFetch<OrganisationRating[]>(`/contractors/${contractor.id}/ratings`);
      setRatings(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load ratings.');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractor.id]);

  const averages = useMemo(() => {
    if (!ratings || ratings.length === 0) return null;
    const byType = (type: RaterType) => {
      const filtered = ratings.filter((r) => r.raterType === type);
      if (filtered.length === 0) return null;
      return filtered.reduce((sum, r) => sum + r.stars, 0) / filtered.length;
    };
    return {
      overall: ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length,
      internal: byType('INTERNAL'),
      client: byType('CLIENT'),
      count: ratings.length,
    };
  }, [ratings]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!appointmentId || stars < 1) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/contractors/${contractor.id}/ratings`, {
        method: 'POST',
        body: { appointmentId, raterType, stars, comment: comment.trim() || undefined },
      });
      setAppointmentId('');
      setStars(0);
      setComment('');
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add rating.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/contractors/${contractor.id}/ratings/${id}`, { method: 'DELETE' });
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove rating.');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Performance ratings</h2>
        {averages && (
          <div className="flex items-center gap-2">
            <StarRating value={Math.round(averages.overall)} />
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {averages.overall.toFixed(1)} avg · {averages.count} rating{averages.count === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>
          There's no client-facing portal yet for clients to submit their own rating — "Client" ratings here are recorded by Setjeka
          staff on the client's behalf (e.g. from a phone call or email) until that portal exists.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {contractor.appointments.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">
          This organisation isn't associated with any project yet — add a project association first, then rate its performance there.
        </p>
      ) : ratings === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : ratings.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400 dark:text-slate-500">No ratings recorded yet.</p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
          {ratings.map((r) => (
            <li key={r.id} className="group/rating flex items-start gap-3 py-2.5">
              <UserSquare2 size={14} className="mt-0.5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StarRating value={r.stars} />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {RATER_TYPE_LABEL[r.raterType]}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{r.appointment.project.name}</span>
                </div>
                {r.comment && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{r.comment}</p>}
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {new Date(r.createdAt).toLocaleDateString()} · recorded by {r.recordedBy.fullName}
                </p>
              </div>
              <button
                onClick={() => remove(r.id)}
                className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/rating:opacity-100 dark:hover:bg-red-950"
                aria-label="Remove rating"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {contractor.appointments.length > 0 && (
        <form onSubmit={handleAdd} className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={appointmentId}
              onChange={setAppointmentId}
              options={[
                { value: '', label: 'Select a project…' },
                ...contractor.appointments.map((a) => ({ value: a.id, label: a.project.name })),
              ]}
              className={`${inputClass} flex-1`}
            />
            <Select value={raterType} onChange={(v) => setRaterType(v as RaterType)} options={RATER_TYPES.map((t) => ({ value: t, label: RATER_TYPE_LABEL[t] }))} className={inputClass} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">Rating:</span>
            <StarRating value={stars} onChange={setStars} size={20} />
          </div>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment (optional)" className={`${inputClass} w-full`} />
          <button
            type="submit"
            disabled={saving || !appointmentId || stars < 1}
            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
          >
            Add rating
          </button>
        </form>
      )}
    </div>
  );
}
