'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api-client';
import { Select } from '@/components/ui/Select';
import {
  CLASSIFICATION_STANDARD_LABEL,
  CONTRACT_FORM_LABEL,
  CURRENCY_LABEL,
  PROJECT_TYPE_LABEL,
  type ClassificationStandard,
  type ContractForm,
  type Currency,
  type ProjectType,
} from '@/lib/projectMeta';

const inputClass =
  'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const labelClass = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400';

interface CreatedProject {
  id: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const { authedFetch } = useAuth();

  const [projectCode, setProjectCode] = useState('');
  const [projectCodeTouched, setProjectCodeTouched] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [client, setClient] = useState('');
  const [developer, setDeveloper] = useState('');
  const [currency, setCurrency] = useState<Currency>('ZAR');
  const [classificationStandard, setClassificationStandard] = useState<ClassificationStandard>('ASAQS');
  const [projectType, setProjectType] = useState<ProjectType | ''>('');
  const [contractForm, setContractForm] = useState<ContractForm | ''>('');
  const [location, setLocation] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [value, setValue] = useState('');
  const [contingencyPct, setContingencyPct] = useState('25');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch<{ projectCode: string }>('/projects/next-code')
      .then((res) => {
        if (!projectCodeTouched) setProjectCode(res.projectCode);
      })
      .catch(() => {
        // Non-fatal: the field just stays blank and the server assigns one on create.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contingencyAmountLabel = (() => {
    const budget = Number.parseFloat(value);
    const pct = Number.parseFloat(contingencyPct);
    if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(pct) || pct < 0) return '';
    const amount = budget * (pct / 100);
    return `${currency} ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  })();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await authedFetch<CreatedProject>('/projects', {
        method: 'POST',
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          projectCode: projectCodeTouched ? projectCode.trim() || undefined : undefined,
          client: client.trim() || undefined,
          developer: developer.trim() || undefined,
          currency,
          classificationStandard,
          projectType: projectType || undefined,
          contractForm: contractForm || undefined,
          location: location.trim() || undefined,
          latitude: latitude.trim() ? Number(latitude) : undefined,
          longitude: longitude.trim() ? Number(longitude) : undefined,
          value: value.trim() ? Number(value) : undefined,
          contingencyPct: contingencyPct.trim() ? Number(contingencyPct) : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      router.push(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft size={14} />
        Back to projects
      </Link>
      <h1 className="mb-1 text-xl font-semibold text-slate-900 dark:text-slate-100">New project</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Set up the project record — you can fill in the rest later.</p>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Basics</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>Project name *</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className={labelClass}>Project code</label>
              <input
                className={inputClass}
                value={projectCode}
                onChange={(e) => {
                  setProjectCode(e.target.value);
                  setProjectCodeTouched(true);
                }}
                placeholder="Auto-generated"
              />
            </div>
            <div>
              <label className={labelClass}>Client</label>
              <input className={inputClass} value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Developer</label>
              <input className={inputClass} value={developer} onChange={(e) => setDeveloper(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Description</label>
              <textarea
                className={`${inputClass} h-20 resize-none py-2`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Classification & currency</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Currency</label>
              <Select
                className={inputClass}
                value={currency}
                onChange={(v) => setCurrency(v as Currency)}
                options={Object.entries(CURRENCY_LABEL).map(([value_, label]) => ({ value: value_, label }))}
              />
            </div>
            <div>
              <label className={labelClass}>Classification standard</label>
              <Select
                className={inputClass}
                value={classificationStandard}
                onChange={(v) => setClassificationStandard(v as ClassificationStandard)}
                options={Object.entries(CLASSIFICATION_STANDARD_LABEL).map(([value_, label]) => ({ value: value_, label }))}
              />
            </div>
            <div>
              <label className={labelClass}>Project type</label>
              <Select
                className={inputClass}
                value={projectType}
                onChange={(v) => setProjectType(v as ProjectType | '')}
                options={[{ value: '', label: '—' }, ...Object.entries(PROJECT_TYPE_LABEL).map(([value_, label]) => ({ value: value_, label }))]}
              />
            </div>
            <div>
              <label className={labelClass}>Contract form</label>
              <Select
                className={inputClass}
                value={contractForm}
                onChange={(v) => setContractForm(v as ContractForm | '')}
                options={[{ value: '', label: '—' }, ...Object.entries(CONTRACT_FORM_LABEL).map(([value_, label]) => ({ value: value_, label }))]}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Location</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className={labelClass}>Site address / location</label>
              <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Latitude (optional)</label>
              <input className={inputClass} type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-33.9249" />
            </div>
            <div>
              <label className={labelClass}>Longitude (optional)</label>
              <input className={inputClass} type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="18.4241" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Coordinates power the site map and weather.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Budget</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Budget estimate ({currency})</label>
              <input className={inputClass} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Contingency %</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                max={100}
                value={contingencyPct}
                onChange={(e) => setContingencyPct(e.target.value)}
              />
              {contingencyAmountLabel && (
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">≈ {contingencyAmountLabel} held against budget</p>
              )}
            </div>
            <div>
              <label className={labelClass}>Start date</label>
              <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>End date</label>
              <input className={inputClass} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create project'}
          </button>
          <Link href="/projects" className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
