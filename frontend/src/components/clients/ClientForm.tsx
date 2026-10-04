'use client';

import { useState, type FormEvent } from 'react';
import { inputClass, labelClass, primaryButton, secondaryButton, type ClientSummary } from '@/lib/stage0';

export type ClientFormValues = Omit<ClientSummary, 'id'>;

const EMPTY: ClientFormValues = {
  name: '',
  registrationNumber: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
};

interface Props {
  initial?: Partial<ClientFormValues>;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: ClientFormValues) => void;
  onCancel?: () => void;
  compact?: boolean;
  embedded?: boolean;
}

/** Shared by the Clients page, the client detail page and the inline "New
 * client" option on a new opportunity. Blank optional fields are sent as
 * null so clearing a field actually clears it. */
export function ClientForm({ initial, submitLabel, saving, onSubmit, onCancel, compact, embedded }: Props) {
  const [values, setValues] = useState<ClientFormValues>({ ...EMPTY, ...initial });
  const set = (key: keyof ClientFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!values.name.trim()) return;
    const clean = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v]),
    ) as ClientFormValues;
    onSubmit(clean);
  }

  const field = (key: keyof ClientFormValues, label: string, opts: { type?: string; span?: boolean; required?: boolean } = {}) => (
    <div className={opts.span ? 'sm:col-span-2' : undefined}>
      <label className={labelClass} htmlFor={`client-${key}`}>
        {label}
        {opts.required && <span className="text-red-500"> *</span>}
      </label>
      <input id={`client-${key}`} type={opts.type ?? 'text'} className={inputClass} value={values[key] ?? ''} onChange={set(key)} />
    </div>
  );

  const body = (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field('name', 'Client / company name', { required: true })}
        {field('registrationNumber', 'Registration number')}
        {field('contactName', 'Contact person')}
        {field('email', 'Contact email', { type: 'email' })}
        {field('phone', 'Contact phone', { type: 'tel' })}
        {!compact && field('address', 'Address')}
        {!compact && (
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="client-notes">
              Notes
            </label>
            <textarea id="client-notes" className={`${inputClass} h-20 resize-none py-2`} value={values.notes ?? ''} onChange={set('notes')} />
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type={embedded ? 'button' : 'submit'}
          onClick={embedded ? () => submit() : undefined}
          disabled={saving || !values.name.trim()}
          className={primaryButton}
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Cancel
          </button>
        )}
      </div>
    </>
  );

  // Embedded inside another form (the new-opportunity form), a nested <form>
  // would be invalid and its submit would fire the outer form instead.
  return embedded ? (
    <div className="space-y-3">{body}</div>
  ) : (
    <form onSubmit={submit} className="space-y-3">
      {body}
    </form>
  );
}
