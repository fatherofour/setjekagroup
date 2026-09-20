'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, X, Check, GanttChart } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProject } from '@/lib/current-project-context';
import { ApiError } from '@/lib/api-client';
import { projectStageInfo, type ProjectStage } from '@/lib/projectStages';
import {
  PROJECT_TYPE_LABEL,
  CONTRACT_FORM_LABEL,
  CURRENCY_LABEL,
  CLASSIFICATION_STANDARD_LABEL,
  pmTitleForContractForm,
  type ProjectType,
  type ContractForm,
  type Currency,
  type ClassificationStandard,
} from '@/lib/projectMeta';
import { ProjectNodeTree } from '@/components/project/ProjectNodeTree';
import { ProjectMembersPanel } from '@/components/project/ProjectMembersPanel';
import { Select } from '@/components/ui/Select';

interface Project {
  id: string;
  projectCode: string | null;
  name: string;
  description: string | null;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
  stage: ProjectStage;
  projectType: ProjectType | null;
  contractForm: ContractForm | null;
  currency: Currency;
  classificationStandard: ClassificationStandard;
  client: string | null;
  developer: string | null;
  location: string | null;
  value: number | null;
  contingencyPct: number | null;
  startDate: string | null;
  endDate: string | null;
  latitude: number | null;
  longitude: number | null;
}

const inputClass =
  'h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-sm text-slate-800 dark:text-slate-100">{value || '—'}</p>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { authedFetch } = useAuth();
  const { setCurrentProject } = useCurrentProject();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Project>>({});

  useEffect(() => {
    authedFetch<Project>(`/projects/${id}`)
      .then((p) => {
        setProject(p);
        setCurrentProject({ id: p.id, name: p.name, status: p.status, stage: p.stage });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load project.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!project) return;
    setForm({ ...project });
    setEditing(true);
  }

  async function save() {
    if (!project) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await authedFetch<Project>(`/projects/${id}`, {
        method: 'PATCH',
        body: {
          description: form.description || null,
          client: form.client || null,
          developer: form.developer || null,
          location: form.location || null,
          value: form.value != null && String(form.value) !== '' ? Number(form.value) : null,
          contingencyPct: form.contingencyPct != null && String(form.contingencyPct) !== '' ? Number(form.contingencyPct) : null,
          currency: form.currency || undefined,
          classificationStandard: form.classificationStandard || undefined,
          projectType: form.projectType || null,
          contractForm: form.contractForm || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          latitude: form.latitude != null && String(form.latitude) !== '' ? Number(form.latitude) : null,
          longitude: form.longitude != null && String(form.longitude) !== '' ? Number(form.longitude) : null,
        },
      });
      setProject(updated);
      setCurrentProject({ id: updated.id, name: updated.name, status: updated.status, stage: updated.stage });
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !project) {
    return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>;
  }
  if (!project) return <p className="text-sm text-slate-400">Loading…</p>;

  const stage = projectStageInfo(project.stage);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
          <ArrowLeft size={14} />
          Back to projects
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{project.name}</h1>
              {project.projectCode && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {project.projectCode}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Stage {stage.number} · {stage.label} — {pmTitleForContractForm(project.contractForm)} leads this project
            </p>
          </div>
          {!editing && (
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${project.id}/schedule`}
                className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-800"
              >
                <GanttChart size={14} />
                Schedule
              </Link>
              <button
                onClick={startEdit}
                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Pencil size={14} />
                Edit details
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Project details</h2>
          {editing && (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400">
                <X size={13} />
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1 rounded-md bg-emerald-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-50"
              >
                <Check size={13} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {editing ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-xs text-slate-400 dark:text-slate-500">Description</label>
              <textarea
                className={`${inputClass} h-20 resize-none py-2`}
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Client</label>
              <input className={inputClass} value={form.client ?? ''} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Developer</label>
              <input className={inputClass} value={form.developer ?? ''} onChange={(e) => setForm({ ...form, developer: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Location</label>
              <input className={inputClass} value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Currency</label>
              <Select
                className={inputClass}
                value={form.currency ?? 'ZAR'}
                onChange={(v) => setForm({ ...form, currency: v as Currency })}
                options={Object.entries(CURRENCY_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Project value</label>
              <input
                type="number"
                className={inputClass}
                value={form.value ?? ''}
                onChange={(e) => setForm({ ...form, value: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Contingency %</label>
              <input
                type="number"
                min={0}
                max={100}
                className={inputClass}
                value={form.contingencyPct ?? ''}
                onChange={(e) => setForm({ ...form, contingencyPct: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Classification standard</label>
              <Select
                className={inputClass}
                value={form.classificationStandard ?? 'ASAQS'}
                onChange={(v) => setForm({ ...form, classificationStandard: v as ClassificationStandard })}
                options={Object.entries(CLASSIFICATION_STANDARD_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Project type</label>
              <Select
                className={inputClass}
                value={form.projectType ?? ''}
                onChange={(v) => setForm({ ...form, projectType: (v || null) as ProjectType | null })}
                options={[{ value: '', label: '—' }, ...Object.entries(PROJECT_TYPE_LABEL).map(([value, label]) => ({ value, label }))]}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Contract form</label>
              <Select
                className={inputClass}
                value={form.contractForm ?? ''}
                onChange={(v) => setForm({ ...form, contractForm: (v || null) as ContractForm | null })}
                options={[{ value: '', label: '—' }, ...Object.entries(CONTRACT_FORM_LABEL).map(([value, label]) => ({ value, label }))]}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Start date</label>
              <input
                type="date"
                className={inputClass}
                value={form.startDate ? form.startDate.slice(0, 10) : ''}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">End date</label>
              <input
                type="date"
                className={inputClass}
                value={form.endDate ? form.endDate.slice(0, 10) : ''}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Latitude</label>
              <input
                type="number"
                step="any"
                className={inputClass}
                value={form.latitude ?? ''}
                onChange={(e) => setForm({ ...form, latitude: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 dark:text-slate-500">Longitude</label>
              <input
                type="number"
                step="any"
                className={inputClass}
                value={form.longitude ?? ''}
                onChange={(e) => setForm({ ...form, longitude: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {project.description && (
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-slate-400 dark:text-slate-500">Description</p>
                <p className="text-sm text-slate-800 dark:text-slate-100">{project.description}</p>
              </div>
            )}
            <Field label="Client" value={project.client ?? ''} />
            <Field label="Developer" value={project.developer ?? ''} />
            <Field label="Location" value={project.location ?? ''} />
            <Field label="Currency" value={CURRENCY_LABEL[project.currency]} />
            <Field
              label="Project value"
              value={project.value != null ? `${CURRENCY_LABEL[project.currency].split(' ')[0]} ${project.value.toLocaleString()}` : ''}
            />
            <Field label="Contingency" value={project.contingencyPct != null ? `${project.contingencyPct}%` : ''} />
            <Field label="Classification standard" value={CLASSIFICATION_STANDARD_LABEL[project.classificationStandard]} />
            <Field label="Project type" value={project.projectType ? PROJECT_TYPE_LABEL[project.projectType] : ''} />
            <Field label="Contract form" value={project.contractForm ? CONTRACT_FORM_LABEL[project.contractForm] : ''} />
            <Field label="Start date" value={project.startDate ? new Date(project.startDate).toLocaleDateString() : ''} />
            <Field label="End date" value={project.endDate ? new Date(project.endDate).toLocaleDateString() : ''} />
            <Field
              label="Coordinates"
              value={project.latitude != null && project.longitude != null ? `${project.latitude}, ${project.longitude}` : ''}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProjectNodeTree projectId={project.id} />
        <ProjectMembersPanel projectId={project.id} />
      </div>
    </div>
  );
}
