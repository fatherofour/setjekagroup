'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, MapPin, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import {
  SITE_STATUS_LABEL,
  SITE_STATUS_TONE,
  cardClass,
  formatMoney,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  type SiteStatus,
} from '@/lib/stage0';
import { EvidenceFiles } from './EvidenceFiles';

interface Site {
  id: string;
  name: string;
  address: string | null;
  erfNumber: string | null;
  sizeSqm: number | null;
  zoning: string | null;
  ownership: string | null;
  askingPrice: number | null;
  currency: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  status: SiteStatus;
  acquisitionStatus: AcquisitionStatus;
  agreedPrice: number | null;
  agreementDate: string | null;
  transferDate: string | null;
}

type AcquisitionStatus = 'NOT_STARTED' | 'NEGOTIATING' | 'OFFER_MADE' | 'AGREEMENT_SIGNED' | 'TRANSFERRED' | 'LEASED' | 'WITHDRAWN';

const ACQUISITION: { value: AcquisitionStatus; label: string }[] = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'NEGOTIATING', label: 'Negotiating' },
  { value: 'OFFER_MADE', label: 'Offer made' },
  { value: 'AGREEMENT_SIGNED', label: 'Sale / lease agreement signed' },
  { value: 'TRANSFERRED', label: 'Transferred' },
  { value: 'LEASED', label: 'Leased' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];

/** PROCSA 0.5 "Manage procurement of land rights": securing the chosen site
 * itself — from negotiation to signed agreement and transfer. */
function AcquisitionEditor({ opportunityId, site, readOnly, onSaved }: { opportunityId: string; site: Site; readOnly: boolean; onSaved: () => void }) {
  const { authedFetch } = useAuth();
  const [f, setF] = useState({
    acquisitionStatus: site.acquisitionStatus,
    agreedPrice: site.agreedPrice?.toString() ?? '',
    agreementDate: site.agreementDate?.slice(0, 10) ?? '',
    transferDate: site.transferDate?.slice(0, 10) ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await authedFetch(`/opportunities/${opportunityId}/sites/${site.id}`, {
        method: 'PATCH',
        body: {
          acquisitionStatus: f.acquisitionStatus,
          agreedPrice: f.agreedPrice === '' ? null : Number(f.agreedPrice),
          agreementDate: f.agreementDate || null,
          transferDate: f.transferDate || null,
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-900 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Land acquisition · PROCSA 0.5</p>
      {error && <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor={`acq-${site.id}`}>
            Status
          </label>
          <Select id={`acq-${site.id}`} disabled={readOnly} value={f.acquisitionStatus} onChange={(v) => setF({ ...f, acquisitionStatus: v as AcquisitionStatus })} className={inputClass} options={ACQUISITION} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`price-${site.id}`}>
            Agreed price ({site.currency ?? 'ZAR'})
          </label>
          <input id={`price-${site.id}`} disabled={readOnly} type="number" min={0} className={inputClass} value={f.agreedPrice} onChange={(e) => setF({ ...f, agreedPrice: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`agr-${site.id}`}>
            Agreement signed
          </label>
          <input id={`agr-${site.id}`} disabled={readOnly} type="date" className={inputClass} value={f.agreementDate} onChange={(e) => setF({ ...f, agreementDate: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor={`trf-${site.id}`}>
            Transfer / registration
          </label>
          <input id={`trf-${site.id}`} disabled={readOnly} type="date" className={inputClass} value={f.transferDate} onChange={(e) => setF({ ...f, transferDate: e.target.value })} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {!readOnly && (
          <button type="button" disabled={busy} onClick={save} className={primaryButton}>
            {busy ? 'Saving…' : 'Save acquisition'}
          </button>
        )}
        <EvidenceFiles opportunityId={opportunityId} linkType="SITE" linkId={site.id} readOnly={readOnly} compact />
      </div>
    </div>
  );
}

const EMPTY = { name: '', address: '', erfNumber: '', sizeSqm: '', zoning: '', ownership: '', askingPrice: '', latitude: '', longitude: '', notes: '' };

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <span className="text-xs text-slate-500 dark:text-slate-400">
      <span className="text-slate-400 dark:text-slate-500">{label}:</span> {value}
    </span>
  );
}

/** PROCSA 0.4 "Source appropriate land": every site considered, and the one
 * chosen. The selected site becomes the project's location on conversion. */
export function OpportunitySitesPanel({ opportunityId, readOnly, onChange }: { opportunityId: string; readOnly: boolean; onChange: () => void }) {
  const { authedFetch } = useAuth();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () =>
    authedFetch<Site[]>(`/opportunities/${opportunityId}/sites`)
      .then(setSites)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load sites.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  async function run(action: () => Promise<unknown>, failure: string) {
    setError(null);
    try {
      await action();
      await load();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await run(
      () =>
        authedFetch(`/opportunities/${opportunityId}/sites`, {
          method: 'POST',
          body: {
            name: form.name.trim(),
            address: form.address.trim() || undefined,
            erfNumber: form.erfNumber.trim() || undefined,
            sizeSqm: num(form.sizeSqm),
            zoning: form.zoning.trim() || undefined,
            ownership: form.ownership.trim() || undefined,
            askingPrice: num(form.askingPrice),
            latitude: num(form.latitude),
            longitude: num(form.longitude),
            notes: form.notes.trim() || undefined,
          },
        }).then(() => {
          setForm(EMPTY);
          setShowForm(false);
        }),
      'Failed to add site.',
    );
    setSaving(false);
  }

  const selected = sites?.find((s) => s.status === 'SELECTED');

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <MapPin size={14} />
            Site register
            <span className="font-normal text-slate-400">· PROCSA 0.4</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Log every site considered and select one. The selected site becomes the project&apos;s location when it moves to Inception.
          </p>
        </div>
        {!readOnly && (
          <button type="button" onClick={() => setShowForm((v) => !v)} className={secondaryButton}>
            <Plus size={14} />
            Add site
          </button>
        )}
      </div>

      {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {sites && sites.length > 0 && !selected && !readOnly && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          No site selected yet — one is required before this opportunity can move to Inception.
        </p>
      )}

      {showForm && (
        <form onSubmit={add} className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelClass} htmlFor="site-name">
                Site name <span className="text-red-500">*</span>
              </label>
              <input id="site-name" className={inputClass} placeholder="e.g. Erf 1234 Centurion" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="lg:col-span-2">
              <label className={labelClass} htmlFor="site-address">
                Address
              </label>
              <input id="site-address" className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="site-erf">
                Erf / stand / title deed no.
              </label>
              <input id="site-erf" className={inputClass} value={form.erfNumber} onChange={(e) => setForm({ ...form, erfNumber: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="site-size">
                Size (m²)
              </label>
              <input id="site-size" type="number" min={0} className={inputClass} value={form.sizeSqm} onChange={(e) => setForm({ ...form, sizeSqm: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="site-zoning">
                Current zoning
              </label>
              <input id="site-zoning" className={inputClass} placeholder="e.g. Business 1" value={form.zoning} onChange={(e) => setForm({ ...form, zoning: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="site-owner">
                Ownership
              </label>
              <input id="site-owner" className={inputClass} placeholder="Owner / seller" value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })} />
            </div>
            <div>
              <label className={labelClass} htmlFor="site-price">
                Asking price
              </label>
              <input id="site-price" type="number" min={0} className={inputClass} value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass} htmlFor="site-lat">
                  Latitude
                </label>
                <input id="site-lat" type="number" step="any" className={inputClass} value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="site-lng">
                  Longitude
                </label>
                <input id="site-lng" type="number" step="any" className={inputClass} value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </div>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={labelClass} htmlFor="site-notes">
                Notes
              </label>
              <textarea id="site-notes" className={`${inputClass} h-16 resize-none py-2`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <button type="submit" disabled={saving || !form.name.trim()} className={primaryButton}>
            {saving ? 'Adding…' : 'Add site'}
          </button>
        </form>
      )}

      {sites === null ? (
        <p className="mt-3 text-sm text-slate-400">Loading…</p>
      ) : sites.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No sites logged yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {sites.map((s) => (
            <li
              key={s.id}
              className={`rounded-lg border p-3 ${
                s.status === 'SELECTED' ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {s.status === 'SELECTED' && <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />}
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SITE_STATUS_TONE[s.status]}`}>{SITE_STATUS_LABEL[s.status]}</span>
                {!readOnly && (
                  <div className="ml-auto flex items-center gap-1.5">
                    {s.status !== 'SELECTED' && (
                      <>
                        <div className="w-32">
                          <Select
                            aria-label={`Status of ${s.name}`}
                            value={s.status}
                            onChange={(v) => run(() => authedFetch(`/opportunities/${opportunityId}/sites/${s.id}`, { method: 'PATCH', body: { status: v } }), 'Failed to update site.')}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            options={(['CANDIDATE', 'SHORTLISTED', 'REJECTED'] as SiteStatus[]).map((v) => ({ value: v, label: SITE_STATUS_LABEL[v] }))}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => run(() => authedFetch(`/opportunities/${opportunityId}/sites/${s.id}/select`, { method: 'POST' }), 'Failed to select site.')}
                          className="h-8 rounded-md bg-emerald-700 px-2.5 text-xs font-medium text-white hover:bg-emerald-800"
                        >
                          Select this site
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => confirm(`Delete site ${s.name}?`) && run(() => authedFetch(`/opportunities/${opportunityId}/sites/${s.id}`, { method: 'DELETE' }), 'Failed to delete site.')}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              {s.address && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{s.address}</p>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                <Fact label="Erf" value={s.erfNumber} />
                <Fact label="Size" value={s.sizeSqm != null ? `${s.sizeSqm.toLocaleString()} m²` : null} />
                <Fact label="Zoning" value={s.zoning} />
                <Fact label="Owner" value={s.ownership} />
                <Fact label="Asking" value={s.askingPrice != null ? formatMoney(s.askingPrice, s.currency) : null} />
                <Fact label="Coordinates" value={s.latitude != null && s.longitude != null ? `${s.latitude}, ${s.longitude}` : null} />
              </div>
              {s.notes && <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">{s.notes}</p>}
              {s.status === 'SELECTED' && (
                <AcquisitionEditor
                  key={`${s.id}-${s.acquisitionStatus}`}
                  opportunityId={opportunityId}
                  site={s}
                  readOnly={readOnly}
                  onSaved={() => {
                    load();
                    onChange();
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
