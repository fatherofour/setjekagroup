'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { MessageSquareQuote, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import { cardClass, inputClass, primaryButton } from '@/lib/stage0';
import { ADVICE_TOPICS, type AdviceTopic } from '@/lib/inception';
import { projectMemberRoleLabel, type ProjectMemberRole } from '@/lib/projectMemberRoles';

interface Advice {
  id: string;
  topic: AdviceTopic;
  body: string;
  authorRole: ProjectMemberRole | null;
  createdAt: string;
  author: { id: string; fullName: string };
}

/** The many PROCSA "Advise on …" items: a consultant records their advice
 * on a topic, and the responsibility tracker credits their role. */
export function AdvicePanel({ projectId, topics, title = 'Consultant advice' }: { projectId: string; topics: AdviceTopic[]; title?: string }) {
  const { authedFetch, user } = useAuth();
  const [advice, setAdvice] = useState<Advice[] | null>(null);
  const [topic, setTopic] = useState<AdviceTopic>(topics[0]);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    authedFetch<Advice[]>(`/projects/${projectId}/inception/advice`)
      .then((all) => setAdvice(all.filter((a) => topics.includes(a.topic))))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load advice.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, topics.join()]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await authedFetch(`/projects/${projectId}/inception/advice`, { method: 'POST', body: { topic, body: body.trim() } });
      setBody('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save advice.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await authedFetch(`/projects/${projectId}/inception/advice/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove advice.');
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <MessageSquareQuote size={14} />
        {title}
      </h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Consultants record their advice here; it counts toward their PROCSA Stage 1 responsibilities.
      </p>
      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      {advice && advice.length > 0 && (
        <ul className="mt-3 space-y-2">
          {advice.map((a) => (
            <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
              <div className="flex items-start gap-2">
                <p className="flex-1 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{a.body}</p>
                {a.author.id === user?.id && (
                  <button type="button" aria-label="Remove advice" onClick={() => remove(a.id)} className="text-slate-400 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {a.author.fullName}
                {a.authorRole && ` · ${projectMemberRoleLabel(a.authorRole)}`}
                {topics.length > 1 && ` · ${ADVICE_TOPICS[a.topic]}`} · {new Date(a.createdAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-3 space-y-2">
        {topics.length > 1 && (
          <div className="max-w-sm">
            <Select aria-label="Advice topic" value={topic} onChange={(v) => setTopic(v as AdviceTopic)} className={inputClass} options={topics.map((t) => ({ value: t, label: ADVICE_TOPICS[t] }))} />
          </div>
        )}
        <textarea aria-label="Advice" className={`${inputClass} h-16 resize-none py-2`} placeholder={`Advice on ${ADVICE_TOPICS[topic].toLowerCase()}…`} value={body} onChange={(e) => setBody(e.target.value)} />
        <button type="submit" disabled={saving || !body.trim()} className={primaryButton}>
          {saving ? 'Saving…' : 'Record advice'}
        </button>
      </form>
    </div>
  );
}
