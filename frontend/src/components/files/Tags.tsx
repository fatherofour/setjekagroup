'use client';

import { useEffect, useState } from 'react';
import { Plus, Tag as TagIcon, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { TAG_COLOURS, type DocTag } from '@/lib/files';

export function TagChip({ tag, onRemove, active, onClick }: { tag: Pick<DocTag, 'name' | 'color'>; onRemove?: () => void; active?: boolean; onClick?: () => void }) {
  const style = { borderColor: tag.color, color: active ? '#fff' : tag.color, background: active ? tag.color : 'transparent' };
  const cls = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4';
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={`${cls} cursor-pointer`} style={style}>
        {tag.name}
      </button>
    );
  return (
    <span className={cls} style={style}>
      {tag.name}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove tag ${tag.name}`} className="rounded-full hover:opacity-70">
          <X size={10} />
        </button>
      )}
    </span>
  );
}

/** The tags on one document: shown as chips, changed from the project's tag
 * list, with new tags made on the spot. */
export function TagEditor({ projectId, documentId, value, onChanged }: { projectId: string; documentId: string; value: DocTag[]; onChanged: () => void }) {
  const { authedFetch } = useAuth();
  const [all, setAll] = useState<DocTag[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [colour, setColour] = useState(TAG_COLOURS[1]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<DocTag[]>(`/projects/${projectId}/document-tags`).then(setAll).catch(() => setAll([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function set(ids: string[]) {
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/documents/${documentId}/tags`, { method: 'PUT', body: { tagIds: ids } });
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not change the tags.');
    }
  }

  async function create() {
    if (!name.trim()) return;
    setError(null);
    try {
      const tags = await authedFetch<DocTag[]>(`/projects/${projectId}/document-tags`, { method: 'POST', body: { name: name.trim(), color: colour } });
      setAll(tags);
      const made = tags.find((t) => t.name === name.trim());
      setName('');
      if (made) await set([...value.map((t) => t.id), made.id]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the tag.');
    }
  }

  const ids = value.map((t) => t.id);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => set(ids.filter((i) => i !== t.id))} />
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-500 hover:border-emerald-600 hover:text-emerald-700 dark:border-slate-600 dark:text-slate-400">
          <TagIcon size={10} />
          {value.length ? 'Change tags' : 'Add tags'}
        </button>
      </div>
      {open && (
        <div className="mt-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
          {all.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {all.map((t) => (
                <TagChip key={t.id} tag={t} active={ids.includes(t.id)} onClick={() => set(ids.includes(t.id) ? ids.filter((i) => i !== t.id) : [...ids, t.id])} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), create())}
              placeholder="New tag"
              maxLength={40}
              className="h-7 w-32 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            {TAG_COLOURS.map((c) => (
              <button key={c} type="button" onClick={() => setColour(c)} aria-label={`Colour ${c}`} className={`h-5 w-5 rounded-full ${colour === c ? 'ring-2 ring-offset-1 ring-slate-500 dark:ring-offset-slate-900' : ''}`} style={{ background: c }} />
            ))}
            <button type="button" onClick={create} disabled={!name.trim()} className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-700 px-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50">
              <Plus size={12} />
              Create
            </button>
          </div>
          {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
