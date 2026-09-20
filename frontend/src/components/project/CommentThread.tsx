'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Trash2, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';

type CommentEntityType = 'TASK' | 'ISSUE' | 'SCHEDULE_ACTIVITY';

interface Comment {
  id: string;
  body: string;
  authorId: string;
  author: { id: string; fullName: string };
  createdAt: string;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Flat (no threading/replies) — a bounded first cut that still covers the
// core ask: in-context discussion on a task/issue/schedule activity instead
// of side-channel email. Reused verbatim across all three entity types.
export function CommentThread({ projectId, entityType, entityId }: { projectId: string; entityType: CommentEntityType; entityId: string }) {
  const { authedFetch, user } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const load = () => {
    authedFetch<Comment[]>(`/projects/${projectId}/comments?entityType=${entityType}&entityId=${entityId}`)
      .then(setComments)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load comments.'));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, entityType, entityId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/comments`, { method: 'POST', body: { entityType, entityId, body: body.trim() } });
      setBody('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to post comment.');
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/projects/${projectId}/comments/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete comment.');
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Comments</h3>
      {error && <p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {comments === null ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">No comments yet — mention a teammate with @Full Name to notify them.</p>
      ) : (
        <ul className="mb-2 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="group/comment rounded-md bg-slate-50 px-2.5 py-2 text-xs dark:bg-slate-800/50">
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-700 dark:text-slate-200">{c.author.fullName}</span>
                <span className="flex items-center gap-2 text-slate-400">
                  {formatWhen(c.createdAt)}
                  {c.authorId === user?.id && (
                    <button onClick={() => remove(c.id)} className="opacity-0 transition hover:text-red-600 group-hover/comment:opacity-100" aria-label="Delete comment">
                      <Trash2 size={12} />
                    </button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-slate-600 dark:text-slate-300">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment… use @Full Name to notify someone"
          rows={2}
          className="h-16 flex-1 resize-none rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={posting || !body.trim()}
          className="flex h-8 items-center gap-1 rounded-md bg-emerald-700 px-2.5 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
        >
          <Send size={12} />
          Post
        </button>
      </form>
    </div>
  );
}
