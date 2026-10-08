'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Camera, CheckSquare, Eye, EyeOff, ImagePlus, Images, MessageSquare, Search, Square, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { isClientUser } from '@/lib/portal';
import { Select } from '@/components/ui/Select';
import { AuthedImage } from './AuthedImage';
import { PhotoUploader } from './PhotoUploader';
import { PhotoViewer } from './PhotoViewer';
import { dayKey, dayLabel, type PhotoLinkOptions, type SitePhoto } from '@/lib/sitePhotos';

const input =
  'h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 sm:h-9 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

/** Site photo capture (FIELD register): a dated, searchable gallery of the
 * project's site photos, each linked to what it shows. In the client
 * portal (`clientView`) it shows only what Setjeka has shared. */
export function SitePhotosPanel({ projectId, clientView = false }: { projectId: string; clientView?: boolean }) {
  const { authedFetch, user } = useAuth();
  const searchParams = useSearchParams();
  const internal = user?.role === 'ADMIN' || user?.accountType === 'INTERNAL';
  const isClient = clientView || isClientUser(user);
  const canUpload = !isClient;

  const [photos, setPhotos] = useState<SitePhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<PhotoLinkOptions | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [linked, setLinked] = useState(() => {
    const issue = searchParams.get('issue');
    const task = searchParams.get('task');
    return issue ? `issue:${issue}` : task ? `task:${task}` : '';
  });
  const [shared, setShared] = useState('');
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get('photo'));
  const [pending, setPending] = useState<File[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedQ.trim()) params.set('q', debouncedQ.trim());
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (shared) params.set('shared', shared);
    const [kind, id] = linked.split(':');
    if (id) params.set(kind === 'issue' ? 'issueId' : kind === 'task' ? 'taskId' : kind === 'activity' ? 'scheduleActivityId' : 'projectNodeId', id);
    authedFetch<SitePhoto[]>(`/projects/${projectId}/site-photos?${params}`)
      .then((list) => {
        setPhotos(list);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load photos'));
  }, [authedFetch, projectId, debouncedQ, from, to, shared, linked]);

  useEffect(load, [load]);

  // What a photo can be linked to. Clients don't link photos, and anyone
  // without access to one of these lists simply gets an empty picker.
  useEffect(() => {
    if (isClient) return;
    const get = <T,>(path: string) => authedFetch<T[]>(path).catch(() => [] as T[]);
    Promise.all([
      get<{ id: string; title: string }>(`/projects/${projectId}/issues`),
      get<{ id: string; title: string }>(`/projects/${projectId}/tasks`),
      get<{ id: string; name: string }>(`/projects/${projectId}/schedule/activities`),
      get<{ id: string; name: string }>(`/projects/${projectId}/nodes`),
    ]).then(([issues, tasks, activities, nodes]) =>
      setLinks({
        issues: issues.map((i) => ({ value: i.id, label: i.title })),
        tasks: tasks.map((t) => ({ value: t.id, label: t.title })),
        activities: activities.map((a) => ({ value: a.id, label: a.name })),
        nodes: nodes.map((n) => ({ value: n.id, label: n.name })),
      }),
    );
  }, [authedFetch, projectId, isClient]);

  const groups = useMemo(() => {
    const out: { key: string; photos: SitePhoto[] }[] = [];
    for (const p of photos ?? []) {
      const key = dayKey(p.takenAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.photos.push(p);
      else out.push({ key, photos: [p] });
    }
    return out;
  }, [photos]);

  const openIndex = photos?.findIndex((p) => p.id === openId) ?? -1;
  const openPhoto = openIndex >= 0 ? photos![openIndex] : null;
  const filtered = Boolean(debouncedQ || from || to || linked || shared);

  function pick(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    if (files.length) setPending(files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (canUpload) pick(e.dataTransfer.files);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function shareSelected(clientVisible: boolean) {
    try {
      await authedFetch(`/projects/${projectId}/site-photos/visibility`, {
        method: 'PATCH',
        body: { ids: [...selected], clientVisible },
      });
      setSelected(new Set());
      setSelecting(false);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update sharing');
    }
  }

  const linkFilterOptions = [
    { value: '', label: 'Linked to anything' },
    ...(links?.issues.map((o) => ({
      value: `issue:${o.value}`,
      label: `Issue · ${o.label}`,
    })) ?? []),
    ...(links?.tasks.map((o) => ({
      value: `task:${o.value}`,
      label: `Task · ${o.label}`,
    })) ?? []),
    ...(links?.activities.map((o) => ({
      value: `activity:${o.value}`,
      label: `Activity · ${o.label}`,
    })) ?? []),
    ...(links?.nodes.map((o) => ({
      value: `node:${o.value}`,
      label: `Area · ${o.label}`,
    })) ?? []),
  ];
  // Keep a link from a notification (?issue=…) filterable before the lists load.
  if (linked && !linkFilterOptions.some((o) => o.value === linked)) linkFilterOptions.push({ value: linked, label: 'The linked record' });

  return (
    <div
      className={`space-y-4 rounded-xl ${dragging ? 'outline-dashed outline-2 outline-offset-4 outline-emerald-500' : ''}`}
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* In the portal the surrounding section already carries the title. */}
      {!clientView && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Site photos</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isClient
                ? 'Photographs from site that Setjeka has shared with you.'
                : internal
                  ? 'Dated, located photos from site. You choose which ones the client sees.'
                  : 'Dated, located photos from site, linked to what they show.'}
            </p>
          </div>
          {canUpload && (
            <div className="flex flex-wrap gap-2">
              {internal && photos && photos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelecting((v) => !v);
                    setSelected(new Set());
                  }}
                  className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 sm:h-9 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {selecting ? <X size={16} /> : <CheckSquare size={16} />}
                  {selecting ? 'Cancel' : 'Select'}
                </button>
              )}
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex h-11 items-center gap-2 rounded-lg border border-emerald-700 px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50 sm:h-9 md:hidden dark:text-emerald-300 dark:hover:bg-emerald-950"
              >
                <Camera size={16} />
                Take photo
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex h-11 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 sm:h-9"
              >
                <ImagePlus size={16} />
                Add photos
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={(e) => {
                  pick(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_2fr_1.3fr]">
        <label className="relative block">
          <span className="sr-only">Search photos</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={`${input} pl-9`} placeholder="Search captions, places, tags, people…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:col-span-1 lg:col-span-2">
          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-500 lg:sr-only">From</span>
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Taken from" title="Taken from" />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-xs text-slate-500 lg:sr-only">To</span>
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} aria-label="Taken up to" title="Taken up to" />
          </label>
        </div>
        {!isClient && <Select className={input} aria-label="Linked to" value={linked} onChange={setLinked} options={linkFilterOptions} />}
        {internal && (
          <Select
            className={input}
            aria-label="Shared with client"
            value={shared}
            onChange={setShared}
            options={[
              { value: '', label: 'Shared or not' },
              { value: 'yes', label: 'Shared with client' },
              { value: 'no', label: 'Not shared' },
            ]}
          />
        )}
      </div>

      {selecting && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="px-2 text-sm text-slate-600 dark:text-slate-300" aria-live="polite">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set(photos?.map((p) => p.id)))}
            className="h-10 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Select all
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={!selected.size}
            onClick={() => shareSelected(true)}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            <Eye size={14} /> Share with client
          </button>
          <button
            type="button"
            disabled={!selected.size}
            onClick={() => shareSelected(false)}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <EyeOff size={14} /> Stop sharing
          </button>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {photos === null ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center dark:border-slate-700">
          <Images size={28} className="text-slate-400" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {filtered ? 'No photos match these filters.' : isClient ? 'No photos have been shared with you yet.' : 'No site photos yet.'}
          </p>
          {!filtered && canUpload && <p className="text-sm text-slate-500">Take one on your phone, or drag photos here from your computer.</p>}
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={dayLabel(g.key)}>
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              {dayLabel(g.key)} <span className="font-normal text-slate-400">· {g.photos.length}</span>
            </h3>
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {g.photos.map((p) => {
                const isSelected = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => (selecting ? toggle(p.id) : setOpenId(p.id))}
                      aria-pressed={selecting ? isSelected : undefined}
                      aria-label={`${p.caption ?? 'Site photo'}, ${new Date(p.takenAt).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}, by ${p.uploadedBy.fullName}`}
                      className={`group relative block aspect-square w-full overflow-hidden rounded-md bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:bg-slate-800 ${isSelected ? 'ring-4 ring-emerald-600' : ''}`}
                    >
                      <AuthedImage
                        path={`/projects/${projectId}/site-photos/${p.id}/file?size=thumb`}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      {selecting && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-white/90 text-emerald-700 dark:bg-slate-900/90">
                          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </span>
                      )}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 text-[11px] text-white">
                        <span className="truncate">{p.caption ?? p.issue?.title ?? p.locationNote ?? ''}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {p.noteCount > 0 && (
                            <span className="flex items-center gap-0.5" title={`${p.noteCount} notes`}>
                              <MessageSquare size={11} />
                              {p.noteCount}
                            </span>
                          )}
                          {internal && p.clientVisible && <Eye size={12} aria-label="Shared with client" />}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {pending && (
        <PhotoUploader
          projectId={projectId}
          files={pending}
          links={links ?? { issues: [], tasks: [], activities: [], nodes: [] }}
          canShare={internal}
          defaults={{
            issueId: linked.startsWith('issue:') ? linked.slice(6) : undefined,
            taskId: linked.startsWith('task:') ? linked.slice(5) : undefined,
          }}
          onUploaded={load}
          onClose={() => setPending(null)}
        />
      )}

      {openPhoto && photos && (
        <PhotoViewer
          key={openPhoto.id}
          photo={openPhoto}
          projectId={projectId}
          index={openIndex}
          total={photos.length}
          canEdit={!isClient && (internal || openPhoto.uploadedById === user?.id)}
          canDelete={!isClient && (internal || openPhoto.uploadedById === user?.id)}
          canShare={internal}
          links={links}
          readOnlyLinks={isClient}
          onPrev={() => setOpenId(photos[(openIndex - 1 + photos.length) % photos.length].id)}
          onNext={() => setOpenId(photos[(openIndex + 1) % photos.length].id)}
          onClose={() => setOpenId(null)}
          onChanged={(updated) => setPhotos((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
          onDeleted={(id) => {
            setOpenId(null);
            setPhotos((prev) => prev?.filter((x) => x.id !== id) ?? null);
          }}
        />
      )}
    </div>
  );
}
