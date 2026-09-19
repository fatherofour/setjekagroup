'use client';

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}

// Free-text multi-value input (used for disciplines) with a datalist of
// suggestions — not a closed dropdown, since the backend stores these as
// free text rather than a fixed enum (see organisationMeta.ts).
export function TagInput({ values, onChange, suggestions, placeholder, className }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const listId = `tag-suggestions-${Math.random().toString(36).slice(2)}`;

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X size={12} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
            </button>
          </span>
        ))}
      </div>
      <input
        list={suggestions ? listId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(draft)}
        placeholder={placeholder ?? 'Type and press Enter'}
        className="mt-1.5 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  );
}
