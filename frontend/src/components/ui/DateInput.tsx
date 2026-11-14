'use client';

import { useRef, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDate, getDateFormat, parseDate } from '@/lib/dates';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** YYYY-MM-DD, as a native date input's value. */
  value: string | null | undefined;
  /** Called like a native date input's onChange: `e.target.value` is
   * YYYY-MM-DD, or '' when cleared. */
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

/** A date field that shows and accepts the person's own date format
 * (critique V3-M-03: the browser's date picker wrote mm/dd/yyyy on a
 * US-set computer, whatever the person chose). Type the date, or use the
 * calendar button, which opens the browser's picker. A drop-in for
 * `<input type="date">`: same value and onChange. */
export function DateInput({ value, onChange, className = '', min, max, disabled, required, id, ...rest }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const shown = draft ?? (value ? formatDate(value, '') : '');

  const emit = (v: string) => {
    if (v === (value ?? '')) return;
    onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLInputElement>);
  };

  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    if (!t) {
      setBad(false);
      setDraft(null);
      emit('');
      return;
    }
    const iso = parseDate(t);
    if (!iso || (min != null && iso < String(min)) || (max != null && iso > String(max))) {
      setBad(true);
      return;
    }
    setBad(false);
    setDraft(null);
    emit(iso);
  };

  const wide = /\bw-full\b|\bflex-1\b/.test(className);
  return (
    <span className={`relative ${wide ? 'flex w-full' : 'inline-flex'}`}>
      <input
        {...rest}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        placeholder={rest.placeholder ?? getDateFormat()}
        aria-invalid={bad || undefined}
        title={bad ? `Write the date as ${getDateFormat()}` : rest.title}
        className={`${className} pr-8 ${bad ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={(e) => {
          commit();
          rest.onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          rest.onKeyDown?.(e);
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Open the calendar"
        onClick={() => {
          const el = picker.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-40 dark:hover:text-slate-200"
      >
        <CalendarDays size={14} aria-hidden />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        value={value ?? ''}
        min={min}
        max={max}
        onChange={(e) => {
          setDraft(null);
          setBad(false);
          emit(e.target.value);
        }}
      />
    </span>
  );
}
