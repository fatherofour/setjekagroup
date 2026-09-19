'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { CLASSIFICATIONS, CLASSIFICATION_LABEL, DISCIPLINE_SUGGESTIONS, type OrganisationClassification } from '@/lib/organisationMeta';
import { ToggleChips } from '@/components/ui/ToggleChips';
import { TagInput } from '@/components/ui/TagInput';

const inputClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

interface DuplicateMatch {
  id: string;
  name: string;
  registrationNumber: string | null;
  taxVatNumber: string | null;
}

interface CreatedContractor {
  id: string;
}

export default function NewContractorPage() {
  const router = useRouter();
  const { authedFetch } = useAuth();

  const [name, setName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [classifications, setClassifications] = useState<OrganisationClassification[]>([]);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [taxVatNumber, setTaxVatNumber] = useState('');
  const [country, setCountry] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [city, setCity] = useState('');
  const [yearEstablished, setYearEstablished] = useState('');
  const [website, setWebsite] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disciplineSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const c of classifications) for (const d of DISCIPLINE_SUGGESTIONS[c] ?? []) set.add(d);
    return Array.from(set);
  }, [classifications]);

  async function checkDuplicates() {
    if (!name.trim() && !registrationNumber.trim() && !taxVatNumber.trim()) return;
    const params = new URLSearchParams();
    if (name.trim()) params.set('name', name.trim());
    if (registrationNumber.trim()) params.set('registrationNumber', registrationNumber.trim());
    if (taxVatNumber.trim()) params.set('taxVatNumber', taxVatNumber.trim());
    try {
      const matches = await authedFetch<DuplicateMatch[]>(`/contractors/check-duplicate?${params.toString()}`);
      setDuplicates(matches);
    } catch {
      // Non-fatal: duplicate check is a convenience warning, not a blocker.
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await authedFetch<CreatedContractor>('/contractors', {
        method: 'POST',
        body: {
          name: name.trim(),
          tradingName: tradingName.trim() || undefined,
          classifications,
          disciplines,
          registrationNumber: registrationNumber.trim() || undefined,
          taxVatNumber: taxVatNumber.trim() || undefined,
          country: country.trim() || undefined,
          stateProvince: stateProvince.trim() || undefined,
          city: city.trim() || undefined,
          yearEstablished: yearEstablished.trim() ? Number(yearEstablished) : undefined,
          website: website.trim() || undefined,
          contactName: contactName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      });
      router.push(`/contractors/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create contractor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/contractors"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} />
        Back to contractors
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">New contractor</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        Register the organisation — contacts, compliance and project appointments are added afterwards on its profile page.
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {duplicates.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">This might already be registered:</p>
            <ul className="mt-1 space-y-0.5">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <Link href={`/contractors/${d.id}`} className="underline hover:no-underline">
                    {d.name}
                  </Link>
                  {d.registrationNumber ? ` · Reg# ${d.registrationNumber}` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">You can still continue if this is a different organisation.</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Organisation</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Organisation name *</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} onBlur={checkDuplicates} required />
            </div>
            <div>
              <label className={labelClass}>Trading name</label>
              <input className={inputClass} value={tradingName} onChange={(e) => setTradingName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Registration number</label>
              <input className={inputClass} value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} onBlur={checkDuplicates} />
            </div>
            <div>
              <label className={labelClass}>Tax / VAT number</label>
              <input className={inputClass} value={taxVatNumber} onChange={(e) => setTaxVatNumber(e.target.value)} onBlur={checkDuplicates} />
            </div>
            <div>
              <label className={labelClass}>Year established</label>
              <input type="number" className={inputClass} value={yearEstablished} onChange={(e) => setYearEstablished(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input className={inputClass} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="example.com" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Classification</h2>
          <p className={labelClass}>What is this organisation? Select all that apply.</p>
          <ToggleChips
            options={CLASSIFICATIONS.map((c) => ({ value: c, label: CLASSIFICATION_LABEL[c] }))}
            selected={classifications}
            onChange={(v) => setClassifications(v as OrganisationClassification[])}
          />
          <p className={`${labelClass} mt-4`}>Disciplines / categories</p>
          <TagInput values={disciplines} onChange={setDisciplines} suggestions={disciplineSuggestions} placeholder="e.g. Building, Civil Works" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Location</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>State / Province</label>
              <input className={inputClass} value={stateProvince} onChange={(e) => setStateProvince(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <label className={labelClass}>Physical address</label>
              <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">General contact</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Contact name</label>
              <input className={inputClass} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>General email</label>
              <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>General phone</label>
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Add named contacts (procurement, accounts, site, etc.) on the profile page after saving.
          </p>
          <div className="mt-3">
            <label className={labelClass}>Notes</label>
            <textarea className={`${inputClass} h-16 resize-none py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create contractor'}
          </button>
          <Link href="/contractors" className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
