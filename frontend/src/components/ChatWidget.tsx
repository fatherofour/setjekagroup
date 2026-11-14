'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { GREEN, GREEN_HOVER } from '@/lib/auth-theme';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { useCurrentProject } from '@/lib/current-project-context';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

interface Status {
  enabled: boolean;
  model: string | null;
  available: boolean;
}

/** The project whose page is open, from the address. */
const projectIdOf = (pathname: string) => {
  const m = /^\/projects\/([0-9a-f-]{36})/.exec(pathname);
  return m ? m[1] : null;
};

const BUTTON_SIZE = 56;
const EDGE_MARGIN = 16;
const DRAG_THRESHOLD = 5;
const POSITION_STORAGE_KEY = 'setjeka-ai-chat-position';

type Position = { right: number; bottom: number };

function clampPosition(pos: Position): Position {
  const maxRight = Math.max(window.innerWidth - BUTTON_SIZE - EDGE_MARGIN, EDGE_MARGIN);
  const maxBottom = Math.max(window.innerHeight - BUTTON_SIZE - EDGE_MARGIN, EDGE_MARGIN);
  return {
    right: Math.min(Math.max(pos.right, EDGE_MARGIN), maxRight),
    bottom: Math.min(Math.max(pos.bottom, EDGE_MARGIN), maxBottom),
  };
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const { authedFetch } = useAuth();
  const { currentProject } = useCurrentProject();
  const pathname = usePathname();
  const projectId = projectIdOf(pathname);
  const projectName = projectId && currentProject?.id === projectId ? currentProject.name : null;
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const listEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || status) return;
    authedFetch<Status>('/assistant/status')
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, model: null, available: false }));
  }, [open, status, authedFetch]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' });
  }, [messages, busy]);
  const [position, setPosition] = useState<Position>({ right: EDGE_MARGIN, bottom: EDGE_MARGIN });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; startRight: number; startBottom: number; dragged: boolean } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.right === 'number' && typeof parsed.bottom === 'number') {
          setPosition(clampPosition(parsed));
        }
      }
    } catch {
      // per-viewer convenience only; ignore unreadable/blocked storage
    }
  }, []);

  useEffect(() => {
    function handleResize() {
      setPosition((prev) => clampPosition(prev));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: position.right,
      startBottom: position.bottom,
      dragged: false,
    };
    setIsDragging(true);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const state = dragState.current;
    if (!state) return;
    const deltaX = e.clientX - state.startX;
    const deltaY = e.clientY - state.startY;
    if (!state.dragged && Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD) {
      state.dragged = true;
    }
    if (state.dragged) {
      setPosition(clampPosition({ right: state.startRight - deltaX, bottom: state.startBottom - deltaY }));
    }
  }

  function handlePointerUp() {
    const state = dragState.current;
    dragState.current = null;
    setIsDragging(false);
    if (state?.dragged) {
      setPosition((prev) => {
        try {
          localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(prev));
        } catch {
          // per-viewer convenience only; ignore unreadable/blocked storage
        }
        return prev;
      });
    } else {
      setOpen(true);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', text }]);
    setDraft('');
    setBusy(true);
    try {
      const r = await authedFetch<{ answer: string; seconds: number }>('/assistant/ask', { method: 'POST', body: { question: text, projectId: projectId ?? undefined, history } });
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', text: r.answer }]);
    } catch (err) {
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: 'assistant', text: err instanceof ApiError ? err.message : 'The assistant could not answer just now.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="Open AI chat (drag to move)"
          // Critique L-08: smaller on a phone, and see-through at rest so a
          // row behind it can still be read; it can also be dragged aside.
          className={`fixed z-30 flex h-11 w-11 items-center justify-center rounded-full opacity-80 shadow-lg transition hover:opacity-100 focus-visible:opacity-100 sm:h-14 sm:w-14 ${
            isDragging ? 'scale-105 cursor-grabbing' : 'cursor-grab hover:scale-105'
          }`}
          style={{ backgroundColor: GREEN, right: position.right, bottom: position.bottom, touchAction: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/setjeka/icon-mark.png"
            alt=""
            className="h-6 w-6 sm:h-7 sm:w-7"
            style={{ filter: 'brightness(0) invert(1)' }}
            draggable={false}
          />
        </button>
      )}

      {open && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:w-[400px]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Setjeka AI Assistant</h2>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{projectId ? `About ${projectName ?? 'this project'}` : 'About all your projects'}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <MessageCircle size={28} className="text-slate-300 dark:text-slate-700" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {projectId ? 'Ask about this project: what is late, what is on the critical path, open RFIs, claims and contract periods.' : 'Ask about your projects. Open a project to ask about it in detail.'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {status === null
                    ? 'Connecting…'
                    : !status.enabled
                      ? 'Not connected to a model yet.'
                      : !status.available && !projectId
                        ? 'The assistant is for the Setjeka team for now.'
                        : `Answers come from the project’s records, by ${status.model} on Setjeka’s own server. They can take up to a minute.`}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'text-white'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                      style={m.role === 'user' ? { backgroundColor: GREEN } : undefined}
                    >
                      <span className="whitespace-pre-wrap">{m.text}</span>
                    </div>
                  </div>
                ))}
                {busy && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      <Loader2 size={14} className="animate-spin" /> Reading the records…
                    </div>
                  </div>
                )}
                <div ref={listEnd} />
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
            <input aria-label="Message the AI assistant"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the AI assistant…"
              className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={!draft.trim() || busy}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: GREEN }}
              onMouseEnter={(e) => {
                if (draft.trim()) e.currentTarget.style.backgroundColor = GREEN_HOVER;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = GREEN;
              }}
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
