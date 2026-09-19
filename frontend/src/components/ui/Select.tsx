'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

// Native <select> dropdown popups are OS-rendered — Chrome on Windows always
// highlights the hovered/keyboard-active row with the system accent blue, and
// no CSS (including accent-color) reliably overrides that. This is a fully
// custom listbox instead, so the highlight color is ours to control.
export function Select({ value, onChange, options, className, id, disabled, ...aria }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.value === value);
      setHighlight(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = options[highlight];
      if (opt) {
        onChange(opt.value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={aria['aria-label']}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        className={`${className ?? ''} flex items-center justify-between text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label : ''}</span>
        <ChevronDown size={15} className="ml-2 shrink-0 text-slate-400" />
      </button>
      {open && !disabled && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-max overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 ${
                idx === highlight ? 'bg-emerald-600 text-white' : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && idx !== highlight && <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
