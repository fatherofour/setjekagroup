'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Eye, EyeOff, MapPin, Pencil, Tag, Trash2, UserRound, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError, apiFetchBlobUrl } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { CommentThread } from '@/components/project/CommentThread';
import { AuthedImage } from './AuthedImage';
import { mapLink, type PhotoLinkOptions, type SitePhoto } from '@/lib/sitePhotos';

const input =
  'h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:h-9 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const label = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400';

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One photo full-size, with what it shows, who took it and where, its
 * links, the client sharing switch and its notes. */
export function PhotoViewer({
  photo,
  projectId,
  index,
  total,
  canEdit,
  canShare,
  canDelete,
  links,
  readOnlyLinks = false,
  onPrev,
  onNext,
  onClose,
  onChanged,
  onDeleted,
}: {
  photo: SitePhoto;
  projectId: string;
  index: number;
  total: number;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  links: PhotoLinkOptions | null;
  /** Clients: show what a photo relates to as plain text, not links into
   * workspace tabs they don't use. */
  readOnlyLinks?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onChanged: (photo: SitePhoto) => void;
  onDeleted: (id: string) => void;
}) {
  const { authedFetch, accessToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    caption: '',
    takenAt: '',
    locationNote: '',
    tags: '',
    issueId: '',
    taskId: '',
    scheduleActivityId: '',
    projectNodeId: '',
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
      if (e.key === 'Escape') onClose();
      else if (!typing && e.key === 'ArrowLeft') onPrev();
      else if (!typing && e.key === 'ArrowRight') onNext();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  function startEdit() {
    setForm({
      caption: photo.caption ?? '',
      takenAt: toLocalInput(photo.takenAt),
      locationNote: photo.locationNote ?? '',
      tags: photo.tags.join(', '),
      issueId: photo.issueId ?? '',
      taskId: photo.taskId ?? '',
      scheduleActivityId: photo.scheduleActivityId ?? '',
      projectNodeId: photo.projectNodeId ?? '',
    });
    setEditing(true);
  }

  async function save(body: Record<string, unknown>) {
    setError(null);
    try {
      const updated = await authedFetch<SitePhoto>(`/projects/${projectId}/site-photos/${photo.id}`, { method: 'PATCH', body });
      onChanged(updated);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
      return false;
    }
  }

  async function saveEdit() {
    const ok = await save({
      caption: form.caption.trim() || null,
      takenAt: new Date(form.takenAt).toISOString(),
      locationNote: form.locationNote.trim() || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      issueId: form.issueId || null,
      taskId: form.taskId || null,
      scheduleActivityId: form.scheduleActivityId || null,
      projectNodeId: form.projectNodeId || null,
    });
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!window.confirm('Delete this photo and its notes? This cannot be undone.')) return;
    try {
      await authedFetch(`/projects/${projectId}/site-photos/${photo.id}`, {
        method: 'DELETE',
      });
      onDeleted(photo.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete');
    }
  }

  async function download() {
    const url = await apiFetchBlobUrl(`/projects/${projectId}/site-photos/${photo.id}/file?download=1`, accessToken);
    const a = document.createElement('a');
    a.href = url;
    a.download = photo.originalFilename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const p = `/projects/${projectId}`;
  const related = [
    photo.issue && {
      label: `Issue · ${photo.issue.title}`,
      href: `${p}?tab=issues`,
    },
    photo.task && {
      label: `Task · ${photo.task.title}`,
      href: `${p}?tab=tasks`,
    },
    photo.scheduleActivity && {
      label: `Activity · ${photo.scheduleActivity.name}`,
      href: `${p}/schedule`,
    },
    photo.projectNode && {
      label: `Area · ${photo.projectNode.name}`,
      href: `${p}?tab=structure`,
    },
  ].filter(Boolean) as { label: string; href: string }[];
  const opt = (placeholder: string, list: { value: string; label: string }[] = []) => [{ value: '', label: placeholder }, ...list];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950/95 lg:flex-row" role="dialog" aria-modal="true" aria-label={photo.caption ?? 'Site photo'}>
      <div className="relative flex min-h-[45dvh] flex-1 items-center justify-center p-2 lg:p-6">
        <AuthedImage key={photo.id} eager path={`${p}/site-photos/${photo.id}/file`} alt={photo.caption ?? 'Site photo'} className="max-h-full max-w-full object-contain" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
        >
          <X size={20} />
        </button>
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <ChevronRight size={22} />
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
              {index + 1} of {total}
            </span>
          </>
        )}
      </div>

      <aside className="max-h-[55dvh] w-full overflow-y-auto bg-white p-4 lg:max-h-none lg:w-[400px] dark:bg-slate-900">
        {error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className={label} htmlFor="pv-caption">
                Caption
              </label>
              <input id="pv-caption" className={input} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="pv-taken">
                Taken
              </label>
              <input id="pv-taken" type="datetime-local" className={input} value={form.takenAt} onChange={(e) => setForm({ ...form, takenAt: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="pv-where">
                Where on site
              </label>
              <input id="pv-where" className={input} value={form.locationNote} onChange={(e) => setForm({ ...form, locationNote: e.target.value })} />
            </div>
            <div>
              <label className={label} htmlFor="pv-tags">
                Tags
              </label>
              <input id="pv-tags" className={input} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
            <div>
              <span className={label}>Issue</span>
              <Select className={input} aria-label="Issue" value={form.issueId} onChange={(v) => setForm({ ...form, issueId: v })} options={opt('Not about an issue', links?.issues)} />
            </div>
            <div>
              <span className={label}>Task</span>
              <Select className={input} aria-label="Task" value={form.taskId} onChange={(v) => setForm({ ...form, taskId: v })} options={opt('Not about a task', links?.tasks)} />
            </div>
            <div>
              <span className={label}>Programme activity</span>
              <Select className={input}
                aria-label="Programme activity"
                value={form.scheduleActivityId}
                onChange={(v) => setForm({ ...form, scheduleActivityId: v })}
                options={opt('No activity', links?.activities)}
              />
            </div>
            <div>
              <span className={label}>Part of the project</span>
              <Select className={input}
                aria-label="Part of the project"
                value={form.projectNodeId}
                onChange={(v) => setForm({ ...form, projectNodeId: v })}
                options={opt('Whole project', links?.nodes)}
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={saveEdit} className="h-11 flex-1 rounded-lg bg-emerald-700 text-sm font-semibold text-white hover:bg-emerald-800 sm:h-9">
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-11 flex-1 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 sm:h-9 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{photo.caption ?? <span className="text-slate-400">No caption</span>}</h2>
              <div className="flex shrink-0 gap-1">
                {canEdit && (
                  <button
                    type="button"
                    onClick={startEdit}
                    aria-label="Edit photo details"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Pencil size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={download}
                  aria-label="Download original"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Download size={16} />
                </button>
                {canDelete && (
                  <button
                    type="button"
                    onClick={remove}
                    aria-label="Delete photo"
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            <dl className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="shrink-0 text-slate-400" />
                <dt className="sr-only">Taken</dt>
                <dd>
                  {new Date(photo.takenAt).toLocaleString('en-ZA', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <UserRound size={14} className="shrink-0 text-slate-400" />
                <dt className="sr-only">Taken by</dt>
                <dd>{photo.uploadedBy.fullName}</dd>
              </div>
              {(photo.locationNote || photo.latitude !== null) && (
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  <dt className="sr-only">Location</dt>
                  <dd>
                    {photo.locationNote}
                    {photo.latitude !== null && photo.longitude !== null && (
                      <a
                        href={mapLink(photo.latitude, photo.longitude)}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-emerald-700 underline dark:text-emerald-400 ${photo.locationNote ? 'ml-2' : ''}`}
                      >
                        Show on map
                      </a>
                    )}
                  </dd>
                </div>
              )}
              {photo.tags.length > 0 && (
                <div className="flex items-start gap-2">
                  <Tag size={14} className="mt-1 shrink-0 text-slate-400" />
                  <dt className="sr-only">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {photo.tags.map((t) => (
                      <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {t}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            {related.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Relates to</p>
                <ul className="space-y-1 text-sm">
                  {related.map((r) => (
                    <li key={r.label}>
                      {readOnlyLinks ? (
                        <span className="text-slate-700 dark:text-slate-300">{r.label}</span>
                      ) : (
                        <Link href={r.href} className="text-emerald-700 hover:underline dark:text-emerald-400">
                          {r.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {canShare && (
              <button
                type="button"
                onClick={() => save({ clientVisible: !photo.clientVisible })}
                aria-pressed={photo.clientVisible}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium ${
                  photo.clientVisible
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {photo.clientVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                {photo.clientVisible ? 'Shared with the client - tap to stop' : 'Not shared with the client - tap to share'}
              </button>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <CommentThread key={photo.id} projectId={projectId} entityType="SITE_PHOTO" entityId={photo.id} />
        </div>
      </aside>
    </div>
  );
}
