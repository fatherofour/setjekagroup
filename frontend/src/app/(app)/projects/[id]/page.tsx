'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, X, Check, GanttChart } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProject } from '@/lib/current-project-context';
import { ApiError } from '@/lib/api-client';
import { projectStageInfo, type ProjectStage } from '@/lib/projectStages';
import {
  PROJECT_TYPE_LABEL,
  CONTRACT_FORM_LABEL,
  COUNTRY_LABEL,
  CURRENCY_LABEL,
  CLASSIFICATION_STANDARD_LABEL,
  pmTitleForContractForm,
  type ProjectType,
  type ContractForm,
  type Country,
  type Currency,
  type ClassificationStandard,
} from '@/lib/projectMeta';
import { ProjectNodeTree } from '@/components/project/ProjectNodeTree';
import { StageGatePanel } from '@/components/project/StageGatePanel';
import { ProjectMembersPanel } from '@/components/project/ProjectMembersPanel';
import { ProjectTasksPanel } from '@/components/project/ProjectTasksPanel';
import { ProjectIssuesPanel } from '@/components/project/ProjectIssuesPanel';
import { ProjectRisksPanel } from '@/components/project/ProjectRisksPanel';
import { ProjectOverviewDashboard } from '@/components/project/ProjectOverviewDashboard';
import { DocumentsPanel } from '@/components/project/DocumentsPanel';
import { TransmittalsPanel } from '@/components/project/TransmittalsPanel';
import { RfisPanel } from '@/components/project/RfisPanel';
import { SubmittalsPanel } from '@/components/project/SubmittalsPanel';
import { RfqsPanel } from '@/components/project/RfqsPanel';
import { PurchaseOrdersPanel } from '@/components/project/PurchaseOrdersPanel';
import { MeetingsPanel } from '@/components/project/MeetingsPanel';
import { InceptionWorkspace } from '@/components/inception/InceptionWorkspace';
import { ProjectCommercial } from '@/components/commercial/ProjectCommercial';
import { ActionRegister } from '@/components/project/ActionRegister';
import { SitePhotosPanel } from '@/components/photos/SitePhotosPanel';
import { SiteWeatherHistory } from '@/components/project/SiteWeatherHistory';
import { ProcsaTracker } from '@/components/delivery/ProcsaTracker';
import { RegistersPanel } from '@/components/delivery/RegistersPanel';
import { ReportsPanel } from '@/components/reports/ReportsPanel';
import { DrawingsPanel } from '@/components/design/DrawingsPanel';
import { AuthoritiesPanel } from '@/components/design/AuthoritiesPanel';
import { InstructionsPanel } from '@/components/design/InstructionsPanel';
import { InspectionsPanel } from '@/components/design/InspectionsPanel';
import { NcrPanel } from '@/components/design/NcrPanel';
import { TestsPanel } from '@/components/design/TestsPanel';
import { InterfacesPanel } from '@/components/design/InterfacesPanel';
import { HiddenWorksPanel } from '@/components/design/HiddenWorksPanel';
import { EotPanel } from '@/components/design/EotPanel';
import { DefectsPanel } from '@/components/design/DefectsPanel';
import { HandoverPanel } from '@/components/design/HandoverPanel';
import { HseWorkspace } from '@/components/design/PermitsPanel';
import { SiteDiaryPanel } from '@/components/design/SiteDiaryPanel';
import { LookAheadPanel } from '@/components/design/LookAheadPanel';
import { PlantPanel } from '@/components/design/PlantPanel';
import { MeasurePanel } from '@/components/qs/MeasurePanel';
import { ModelsPanel } from '@/components/design/ModelsPanel';
import { PunchPanel } from '@/components/design/PunchPanel';
import { BimHubPanel } from '@/components/bim/BimHubPanel';
import { Select } from '@/components/ui/Select';
import type { TabItem } from '@/components/ui/Tabs';
import { useProjectAccess } from '@/lib/project-access';
import { PROJECT_NAV, projectPlace, projectTabOf } from '@/components/nav';

/** Where this screen sits (project, module, screen) and the other screens
 * of its module, in place of the old row of every screen: the sidebar
 * holds the rest (the navigation review, 2026-11-04). */
function ScreenBar({ projectId, projectName, tab, ctab, canOpen }: { projectId: string; projectName: string; tab: string; ctab: string | null; canOpen: (tab: string) => boolean }) {
  const place = projectPlace(tab, ctab) ?? projectPlace(tab, null);
  const group = PROJECT_NAV.find((g) => g.label === place?.module);
  const screens = (group?.children ?? []).filter((c) => {
    const t = projectTabOf(c);
    return t !== null && canOpen(t);
  });
  return (
    <div className="space-y-2">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <Link href={`/projects/${projectId}`} className="hover:text-slate-800 dark:hover:text-slate-200">
          {projectName}
        </Link>
        {place && (
          <>
            <span aria-hidden>›</span>
            <span>{place.module}</span>
            <span aria-hidden>›</span>
            <span className="font-medium text-slate-700 dark:text-slate-200">{place.screen}</span>
          </>
        )}
      </nav>
      {/* Commercial's screens are its own tabs (cost report, bills...), so a
          second row would repeat them. */}
      {screens.length > 1 && tab !== 'commercial' && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
          {screens.map((c) => {
            const t = projectTabOf(c)!;
            const leafCtab = new URLSearchParams((c.projectPathSuffix ?? '').replace(/^\?/, '')).get('ctab');
            const active = t === tab && (leafCtab === null ? !ctab || !screens.some((o) => projectTabOf(o) === t && o !== c && (o.projectPathSuffix ?? '').includes(`ctab=${ctab}`)) : leafCtab === ctab);
            return (
              <Link
                key={c.label}
                href={`/projects/${projectId}${c.projectPathSuffix ?? ''}`}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const WORKSPACE_TABS: TabItem[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'inception', label: 'Inception (Stage 1)' },
  { value: 'procsa', label: 'PROCSA' },
  { value: 'meetings', label: 'Meetings' },
  { value: 'actions', label: 'Actions' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'issues', label: 'Issues' },
  { value: 'risks', label: 'Risks' },
  { value: 'documents', label: 'Documents' },
  { value: 'drawings', label: 'Drawings' },
  { value: 'models', label: 'Models' },
  { value: 'bim', label: 'BIM hub' },
  { value: 'authorities', label: 'Authorities' },
  { value: 'instructions', label: 'Instructions' },
  { value: 'inspections', label: 'Inspections' },
  { value: 'ncrs', label: 'NCRs' },
  { value: 'tests', label: 'Tests & hold points' },
  { value: 'hidden', label: 'Hidden works' },
  { value: 'interfaces', label: 'Interfaces' },
  { value: 'eot', label: 'Delays & EOT' },
  { value: 'defects', label: 'Completion & defects' },
  { value: 'handover', label: 'Handover pack' },
  { value: 'hse', label: 'Health & safety' },
  { value: 'diary', label: 'Site diary' },
  { value: 'lookahead', label: 'Look-ahead' },
  { value: 'plant', label: 'Plant & equipment' },
  { value: 'measure', label: 'Site measurement' },
  { value: 'punch', label: 'Punch list' },
  { value: 'photos', label: 'Site photos' },
  { value: 'technical', label: 'RFIs & Submittals' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'registers', label: 'Registers' },
  { value: 'reports', label: 'Reports' },
  { value: 'team', label: 'Team' },
  { value: 'structure', label: 'Structure' },
];

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
  country: Country;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authedFetch, user } = useAuth();
  // Who may open which screen here: the same rule the sidebar offers them by.
  const { isExternal, isClient, seesCommercial, roleKnown, canOpen } = useProjectAccess(id);
  const { currentProject, setCurrentProject } = useCurrentProject();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Project>>({});
  const [tab, setTab] = useState(() => {
    const requested = searchParams.get('tab');
    return WORKSPACE_TABS.some((t) => t.value === requested) ? requested! : 'overview';
  });

  useEffect(() => {
    // A query-string-only navigation (e.g. the sidebar's Documents link,
    // ?tab=documents) doesn't remount this component — Next.js reuses the
    // existing instance for the same dynamic segment — so the initial
    // useState above won't re-run on its own; this keeps `tab` in sync
    // whenever the URL's ?tab changes after mount.
    const requested = searchParams.get('tab');
    if (requested && WORKSPACE_TABS.some((t) => t.value === requested)) setTab(requested);
  }, [searchParams]);

  function loadProject() {
    return authedFetch<Project>(`/projects/${id}`)
      .then((p) => {
        setProject(p);
        setCurrentProject({ id: p.id, name: p.name, status: p.status, stage: p.stage });
      })
      .catch((err) => {
        // A stale currentProject (e.g. pointing at a since-deleted project,
        // left over in localStorage from a prior session) would otherwise
        // strand this page in a permanent error state with no way out
        // except manually clearing storage.
        if (err instanceof ApiError && err.status === 404) {
          if (currentProject?.id === id) setCurrentProject(null);
          router.replace('/projects');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Failed to load project.');
      });
  }

  useEffect(() => {
    loadProject();
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
          country: form.country || undefined,
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

      <ScreenBar projectId={project.id} projectName={project.name} tab={tab} ctab={searchParams.get('ctab')} canOpen={canOpen} />

      {tab === 'overview' && (
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
              <label className="text-xs text-slate-400 dark:text-slate-500">Country</label>
              <Select
                aria-label="Country"
                className={inputClass}
                value={form.country ?? 'ZA'}
                onChange={(v) => setForm({ ...form, country: v as Country })}
                options={Object.entries(COUNTRY_LABEL).map(([value, label]) => ({ value, label }))}
              />
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
            <Field label="Country" value={COUNTRY_LABEL[project.country ?? 'ZA']} />
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
      )}

      {tab === 'overview' && <StageGatePanel currentStage={project.stage} projectId={project.id} onStageChanged={loadProject} />}
      {tab === 'overview' && <ProjectOverviewDashboard projectId={project.id} />}
      {tab === 'overview' && <SiteWeatherHistory projectId={project.id} />}
      {tab === 'inception' && (
        <InceptionWorkspace projectId={project.id} projectName={project.name} stage={project.stage} currency={project.currency} onProjectChanged={loadProject} />
      )}
      {tab === 'meetings' && <MeetingsPanel projectId={project.id} />}
      {tab === 'tasks' && <ProjectTasksPanel projectId={project.id} />}
      {tab === 'issues' && <ProjectIssuesPanel projectId={project.id} />}
      {tab === 'risks' && <ProjectRisksPanel projectId={project.id} />}
      {tab === 'documents' && (
        <div className="space-y-4">
          <DocumentsPanel projectId={project.id} />
          <TransmittalsPanel projectId={project.id} />
        </div>
      )}
      {tab === 'technical' && (
        <div className="space-y-4">
          <RfisPanel projectId={project.id} />
          <SubmittalsPanel projectId={project.id} />
        </div>
      )}
      {tab === 'procurement' && (
        <div className="space-y-4">
          <RfqsPanel projectId={project.id} isExternal={isExternal} />
          <PurchaseOrdersPanel projectId={project.id} isExternal={isExternal} />
        </div>
      )}
      {tab === 'actions' && <ActionRegister projectId={project.id} />}
      {tab === 'procsa' && (
        <ProcsaTracker
          projectId={project.id}
          onGoTo={(t, register) => router.push(`/projects/${project.id}?tab=${t}${register ? `&register=${register}` : ''}`)}
        />
      )}
      {tab === 'reports' && <ReportsPanel projectId={project.id} />}
      {tab === 'drawings' && <DrawingsPanel projectId={project.id} />}
      {tab === 'models' && <ModelsPanel projectId={project.id} />}
      {tab === 'authorities' && <AuthoritiesPanel projectId={project.id} />}
      {tab === 'instructions' && <InstructionsPanel projectId={project.id} />}
      {tab === 'inspections' && roleKnown && !isClient && <InspectionsPanel projectId={project.id} />}
      {tab === 'ncrs' && roleKnown && !isClient && <NcrPanel projectId={project.id} />}
      {tab === 'tests' && roleKnown && !isClient && <TestsPanel projectId={project.id} />}
      {tab === 'hidden' && roleKnown && !isClient && <HiddenWorksPanel projectId={project.id} />}
      {tab === 'interfaces' && roleKnown && !isClient && <InterfacesPanel projectId={project.id} />}
      {tab === 'eot' && roleKnown && <EotPanel projectId={project.id} />}
      {tab === 'defects' && roleKnown && <DefectsPanel projectId={project.id} />}
      {tab === 'handover' && roleKnown && <HandoverPanel projectId={project.id} />}
      {tab === 'hse' && roleKnown && !isClient && <HseWorkspace projectId={project.id} />}
      {tab === 'diary' && roleKnown && !isClient && <SiteDiaryPanel projectId={project.id} />}
      {tab === 'lookahead' && roleKnown && !isClient && <LookAheadPanel projectId={project.id} />}
      {tab === 'plant' && roleKnown && !isClient && <PlantPanel projectId={project.id} />}
      {tab === 'measure' && roleKnown && !isClient && <MeasurePanel projectId={project.id} />}
      {tab === 'punch' && roleKnown && !isClient && <PunchPanel projectId={project.id} />}
      {tab === 'bim' && roleKnown && !isClient && <BimHubPanel projectId={project.id} />}
      {tab === 'registers' && <RegistersPanel key={searchParams.get('register') ?? 'registers'} projectId={project.id} initial={searchParams.get('register') ?? undefined} />}
      {tab === 'photos' && <SitePhotosPanel projectId={project.id} />}
      {tab === 'commercial' && seesCommercial && <ProjectCommercial key={searchParams.get('ctab') ?? ''} projectId={project.id} currency={project.currency} contractForm={project.contractForm} isClient={isClient} internal={!isExternal || user?.role === 'ADMIN'} />}
      {tab === 'team' && <ProjectMembersPanel projectId={project.id} contractForm={project.contractForm} />}
      {tab === 'structure' && <ProjectNodeTree projectId={project.id} />}
    </div>
  );
}
