'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, TriangleAlert, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { currentPosition, preparePhoto, type PhotoLinkOptions, type SitePhoto } from '@/lib/sitePhotos';

interface Item {
  key: string;
  file: File;
  caption: string;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  error?: string;
}

const input =
  'h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:h-9 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const label = 'mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400';

/** A preview of a chosen file. The object URL is made when the image
 * element appears and freed as soon as it has loaded, so nothing leaks and
 * React's development double-mount can't revoke it early. */
function LocalPreview({ file }: { file: File }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
    <img
      alt=""
      className="h-16 w-16 shrink-0 rounded-md bg-slate-100 object-cover dark:bg-slate-800"
      ref={(el) => {
        if (!el || el.src) return;
        const url = URL.createObjectURL(file);
        el.onload = el.onerror = () => URL.revokeObjectURL(url);
        el.src = url;
      }}
    />
  );
}

const none = (placeholder: string, options: { value: string; label: string }[]) => [{ value: '', label: placeholder }, ...options];

/** The sheet that opens after choosing or taking photos: one caption per
 * photo, and where/what they show for the whole batch. */
export function PhotoUploader({
  projectId,
  files,
  links,
  canShare,
  defaults,
  onUploaded,
  onClose,
}: {
  projectId: string;
  files: File[];
  links: PhotoLinkOptions;
  canShare: boolean;
  defaults?: { issueId?: string; taskId?: string };
  onUploaded: (photos: SitePhoto[]) => void;
  onClose: () => void;
}) {
  const { authedFetch } = useAuth();
  const [items, setItems] = useState<Item[]>(() =>
    files.map((file, i) => ({
      key: `${i}-${file.name}-${file.size}`,
      file,
      caption: '',
      state: 'waiting',
    })),
  );
  const [locationNote, setLocationNote] = useState('');
  const [projectNodeId, setProjectNodeId] = useState('');
  const [scheduleActivityId, setScheduleActivityId] = useState('');
  const [issueId, setIssueId] = useState(defaults?.issueId ?? '');
  const [taskId, setTaskId] = useState(defaults?.taskId ?? '');
  const [tags, setTags] = useState('');
  const [share, setShare] = useState(false);
  const [useMyLocation, setUseMyLocation] = useState(true);
  const [busy, setBusy] = useState(false);

  const done = items.filter((i) => i.state === 'done').length;
  const failed = items.filter((i) => i.state === 'failed').length;
  const finished = done + failed === items.length && items.length > 0 && !busy && (done > 0 || failed > 0);
  const remaining = useMemo(() => items.filter((i) => i.state === 'waiting' || i.state === 'failed'), [items]);

  function patch(key: string, change: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }

  async function upload() {
    setBusy(true);
    const here = useMyLocation ? await currentPosition() : null;
    const uploaded: SitePhoto[] = [];
    for (const item of remaining) {
      patch(item.key, { state: 'uploading', error: undefined });
      try {
        const prepared = await preparePhoto(item.file);
        const form = new FormData();
        form.append('file', prepared.file, prepared.file.name);
        if (prepared.thumb) form.append('thumb', prepared.thumb, 'thumb.jpg');
        const lat = prepared.latitude ?? here?.latitude;
        const lng = prepared.longitude ?? here?.longitude;
        const fields: Record<string, string | undefined> = {
          caption: item.caption.trim() || undefined,
          takenAt: prepared.takenAt?.toISOString(),
          latitude: lat?.toString(),
          longitude: lng?.toString(),
          locationNote: locationNote.trim() || undefined,
          tags: tags.trim() || undefined,
          projectNodeId: projectNodeId || undefined,
          scheduleActivityId: scheduleActivityId || undefined,
          issueId: issueId || undefined,
          taskId: taskId || undefined,
          clientVisible: canShare && share ? 'true' : undefined,
        };
        for (const [k, v] of Object.entries(fields)) if (v !== undefined) form.append(k, v);
        const photo = await authedFetch<SitePhoto>(`/projects/${projectId}/site-photos`, { method: 'POST', formData: form });
        uploaded.push(photo);
        patch(item.key, { state: 'done' });
      } catch (e) {
        patch(item.key, {
          state: 'failed',
          error: e instanceof ApiError ? e.message : 'Upload failed - check your connection and try again',
        });
      }
    }
    setBusy(false);
    if (uploaded.length) onUploaded(uploaded);
  }

  function remove(key: string) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="photo-upload-title">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 id="photo-upload-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Add {items.length} site photo{items.length === 1 ? '' : 's'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.key} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                <LocalPreview file={item.file} />
                <div className="min-w-0 flex-1">
                  <input
                    className={input}
                    placeholder="What does this show? (optional)"
                    aria-label={`Caption for ${item.file.name}`}
                    value={item.caption}
                    disabled={item.state === 'done' || busy}
                    onChange={(e) => patch(item.key, { caption: e.target.value })}
                  />
                  {item.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{item.error}</p>}
                </div>
                <span className="w-10 shrink-0 text-center" aria-live="polite">
                  {item.state === 'uploading' && <Loader2 size={18} className="mx-auto animate-spin text-emerald-600" aria-label="Uploading" />}
                  {item.state === 'done' && <CheckCircle2 size={18} className="mx-auto text-emerald-600" aria-label="Uploaded" />}
                  {item.state === 'failed' && <TriangleAlert size={18} className="mx-auto text-red-600" aria-label="Failed" />}
                  {item.state === 'waiting' && !busy && (
                    <button
                      type="button"
                      onClick={() => remove(item.key)}
                      aria-label={`Remove ${item.file.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                    >
                      <X size={16} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">For all of these photos</legend>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="photo-where">
                Where on site
              </label>
              <input id="photo-where" className={input} placeholder="e.g. Block B, level 2, east stair" value={locationNote} onChange={(e) => setLocationNote(e.target.value)} />
            </div>
            <div>
              <span className={label}>Issue</span>
              <Select className={input} aria-label="Issue" value={issueId} onChange={setIssueId} options={none('Not about an issue', links.issues)} />
            </div>
            <div>
              <span className={label}>Task</span>
              <Select className={input} aria-label="Task" value={taskId} onChange={setTaskId} options={none('Not about a task', links.tasks)} />
            </div>
            <div>
              <span className={label}>Programme activity</span>
              <Select className={input} aria-label="Programme activity" value={scheduleActivityId} onChange={setScheduleActivityId} options={none('No activity', links.activities)} />
            </div>
            <div>
              <span className={label}>Part of the project</span>
              <Select className={input} aria-label="Part of the project" value={projectNodeId} onChange={setProjectNodeId} options={none('Whole project', links.nodes)} />
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="photo-tags">
                Tags
              </label>
              <input id="photo-tags" className={input} placeholder="e.g. progress, defect, safety (comma separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
              <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={useMyLocation} onChange={(e) => setUseMyLocation(e.target.checked)} />
              <MapPin size={14} className="text-slate-400" />
              Use my current location for photos without their own GPS
            </label>
            {canShare && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
                <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={share} onChange={(e) => setShare(e.target.checked)} />
                Share with the client now (they&apos;ll see these in their portal)
              </label>
            )}
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <p className="text-sm text-slate-500" aria-live="polite">
            {busy
              ? `Uploading ${done + 1} of ${items.length}…`
              : finished
                ? `${done} uploaded${failed ? `, ${failed} failed` : ''}`
                : 'Photos are made smaller on this device before upload.'}
          </p>
          {finished && failed === 0 ? (
            <button type="button" onClick={onClose} className="h-11 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 sm:h-9">
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={upload}
              disabled={busy || remaining.length === 0}
              className="flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 sm:h-9"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {failed > 0 && !busy ? `Retry ${failed}` : `Upload ${remaining.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
