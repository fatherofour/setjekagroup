'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, CircleDot } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Select } from '@/components/ui/Select';
import { inputClass } from '@/lib/stage0';
import { memberLabel, STAGE_OPTIONS, type MemberRef } from '@/lib/inception';
import { SignOffSection, SECTION_FOR_DELIVERABLE, type Deliverable } from './SignOffSection';
import { ResponsibilitiesSection } from './ResponsibilitiesSection';
import { BriefSection } from './BriefSection';
import { SiteAssessmentSection } from './SiteAssessmentSection';
import { ViabilitySection } from './ViabilitySection';
import { ProcurementPolicySection } from './ProcurementPolicySection';
import { ProfessionalTeamSection } from './ProfessionalTeamSection';
import { ProgrammeSection } from './ProgrammeSection';
import { RegisterPanel } from './RegisterPanel';
import { MilestonesPanel } from '@/components/opportunities/MilestonesPanel';
import { MyStage1Section } from './MyStage1Section';

const SECTIONS = [
  { value: 'mine', label: 'My Stage 1', group: 'Overview' },
  { value: 'signoff', label: 'Sign-off', group: 'Overview' },
  { value: 'responsibilities', label: 'Responsibilities by role', group: 'Overview' },
  { value: 'brief', label: 'Project brief', group: 'Stage 1 documents' },
  { value: 'site', label: 'Site assessment', group: 'Stage 1 documents' },
  { value: 'viability', label: 'Desktop viability', group: 'Stage 1 documents' },
  { value: 'policy', label: 'Procurement policy', group: 'Stage 1 documents' },
  { value: 'consents', label: 'Consents & approvals', group: 'Stage 1 documents' },
  { value: 'team', label: 'Professional team', group: 'Stage 1 documents' },
  { value: 'programme', label: 'Initiation programme', group: 'Stage 1 documents' },
  { value: 'information', label: 'Information register', group: 'Supporting' },
  { value: 'criteria', label: 'Financial design criteria', group: 'Supporting' },
  { value: 'milestones', label: 'Development milestones', group: 'Supporting' },
];

const CONSENT_STATUS = [
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PREPARATION', label: 'In preparation' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'NOT_REQUIRED', label: 'Not required' },
];

const INFO_STATUS = [
  { value: 'REQUIRED', label: 'Required' },
  { value: 'REQUESTED', label: 'Requested' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'NOT_AVAILABLE', label: 'Not available' },
];

const date = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString() : null);

/** PROCSA Stage 1 — Inception: everything every role does at this stage,
 * on one tab of the project workspace. */
export function InceptionWorkspace({ projectId, projectName, stage, currency, onProjectChanged }: { projectId: string; projectName: string; stage: string; currency: string; onProjectChanged?: () => void }) {
  const { authedFetch, user } = useAuth();
  // Consultants land on their own list; Setjeka staff on the sign-off overview.
  const external = Boolean(user && user.accountType !== 'INTERNAL' && user.role !== 'ADMIN');
  const [section, setSection] = useState(external ? 'mine' : 'signoff');
  const [status, setStatus] = useState<Record<string, Deliverable['status'] | 'READY' | 'NOT_READY'>>({});
  const [version, setVersion] = useState(0);

  const refreshStatus = useCallback(() => {
    authedFetch<Deliverable[]>(`/projects/${projectId}/inception/deliverables`)
      .then((items) => {
        const next: Record<string, Deliverable['status'] | 'READY' | 'NOT_READY'> = {};
        for (const d of items) next[SECTION_FOR_DELIVERABLE[d.key]] = d.status === 'DRAFT' ? (d.ready ? 'READY' : 'NOT_READY') : d.status;
        setStatus(next);
      })
      .catch(() => {});
  }, [authedFetch, projectId]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus, version]);

  const changed = () => setVersion((v) => v + 1);

  const marker = (value: string) => {
    const s = status[value];
    if (!s) return null;
    if (s === 'APPROVED') return <CheckCircle2 size={13} className="text-emerald-600" />;
    if (s === 'SUBMITTED') return <CircleDot size={13} className="text-blue-500" />;
    if (s === 'READY') return <CircleDot size={13} className="text-slate-400" />;
    if (s === 'REVISION_REQUESTED') return <CircleDot size={13} className="text-amber-500" />;
    return <Circle size={13} className="text-slate-300 dark:text-slate-600" />;
  };

  const groups = [...new Set(SECTIONS.map((s) => s.group))];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="lg:hidden">
        <Select aria-label="Inception section" value={section} onChange={setSection} className={inputClass} options={SECTIONS.map((s) => ({ value: s.value, label: s.label }))} />
      </div>
      <nav className="hidden w-56 shrink-0 lg:block" aria-label="Inception sections">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">PROCSA Stage 1 — Inception</p>
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <p className="mb-1 px-2 text-[11px] text-slate-400">{g}</p>
            {SECTIONS.filter((s) => s.group === g).map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSection(s.value)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                  section === s.value ? 'bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex-1">{s.label}</span>
                {marker(s.value)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {section === 'signoff' && (
          <SignOffSection
            key={version}
            projectId={projectId}
            stage={stage}
            onGoTo={setSection}
            onChanged={() => {
              refreshStatus();
              onProjectChanged?.();
            }}
          />
        )}
        {section === 'mine' && <MyStage1Section projectId={projectId} onGoTo={setSection} onChange={changed} />}
        {section === 'responsibilities' && <ResponsibilitiesSection projectId={projectId} />}
        {section === 'brief' && <BriefSection projectId={projectId} currency={currency} onChange={changed} />}
        {section === 'site' && <SiteAssessmentSection projectId={projectId} currency={currency} onChange={changed} />}
        {section === 'viability' && <ViabilitySection projectId={projectId} currency={currency} onChange={changed} />}
        {section === 'policy' && <ProcurementPolicySection projectId={projectId} onChange={changed} />}
        {section === 'team' && <ProfessionalTeamSection projectId={projectId} projectName={projectName} onChange={changed} />}
        {section === 'programme' && <ProgrammeSection projectId={projectId} onChange={changed} />}
        {section === 'milestones' && <MilestonesPanel basePath={`/projects/${projectId}/inception/milestones`} />}
        {section === 'consents' && (
          <RegisterPanel
            projectId={projectId}
            register="consents"
            title="Schedule of consents and approvals"
            procsa="PM 1.7 · consultants 1.4"
            description="Every statutory consent and approval the project needs, who prepares it, and by which stage. Stage 0 authority approvals carry over automatically."
            addLabel="Add consent"
            statusField="status"
            onChange={changed}
            fields={[
              {
                name: 'title',
                label: 'Consent / approval',
                kind: 'text',
                required: true,
                wide: true,
                suggestions: ['Site development plan', 'Building plan approval', 'Rezoning', 'Consent use', 'Environmental authorisation', 'Heritage permit', 'Water & sewer connection', 'Electrical supply agreement', 'Traffic / access approval', 'Fire department approval'],
              },
              { name: 'authority', label: 'Authority', kind: 'text', placeholder: 'e.g. City of Tshwane' },
              { name: 'category', label: 'Category', kind: 'text', suggestions: ['Planning', 'Statutory', 'Environmental', 'Infrastructure', 'Legal'] },
              { name: 'responsibleId', label: 'Prepared by', kind: 'member' },
              { name: 'requiredByStage', label: 'Needed by stage', kind: 'select', options: STAGE_OPTIONS },
              { name: 'status', label: 'Status', kind: 'select', options: CONSENT_STATUS },
              { name: 'plannedSubmission', label: 'Planned submission', kind: 'date' },
              { name: 'submittedAt', label: 'Submitted', kind: 'date' },
              { name: 'approvedAt', label: 'Approved', kind: 'date' },
              { name: 'reference', label: 'Reference', kind: 'text' },
              { name: 'notes', label: 'Notes', kind: 'textarea' },
            ]}
            renderRow={(row) => ({
              primary: <span className="font-medium">{String(row.title)}</span>,
              secondary:
                [
                  row.authority,
                  row.responsible && `Prepared by ${memberLabel(row.responsible as MemberRef)}`,
                  row.requiredByStage && `needed by ${STAGE_OPTIONS.find((s) => s.value === row.requiredByStage)?.label}`,
                  date(row.plannedSubmission) && `planned ${date(row.plannedSubmission)}`,
                  date(row.approvedAt) && `approved ${date(row.approvedAt)}`,
                  row.reference && `ref ${row.reference}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined,
            })}
          />
        )}
        {section === 'information' && (
          <RegisterPanel
            projectId={projectId}
            register="information"
            title="Information register — data, drawings and plans"
            procsa="Architect 1.7 · engineers 1.8 · QS 1.9"
            description="What information exists about the site and project, who holds it, and whether the team has it. Share the files themselves through Documents and Transmittals."
            addLabel="Add item"
            statusField="status"
            onChange={changed}
            fields={[
              {
                name: 'title',
                label: 'Information',
                kind: 'text',
                required: true,
                wide: true,
                suggestions: ['Title deed', 'SG diagram', 'Zoning certificate', 'Existing building drawings', 'Services as-builts', 'Previous geotechnical report', 'Topographical survey', 'Lease agreements'],
              },
              { name: 'category', label: 'Category', kind: 'text', suggestions: ['Legal', 'Survey', 'Drawings', 'Services', 'Reports'] },
              { name: 'heldBy', label: 'Held by', kind: 'text', placeholder: 'e.g. Client, municipality, previous architect' },
              { name: 'responsibleId', label: 'Responsible', kind: 'member' },
              { name: 'status', label: 'Status', kind: 'select', options: INFO_STATUS },
              { name: 'dueDate', label: 'Needed by', kind: 'date' },
              { name: 'documentId', label: 'Linked document', kind: 'document' },
              { name: 'notes', label: 'Notes', kind: 'textarea' },
            ]}
            renderRow={(row) => ({
              primary: <span className="font-medium">{String(row.title)}</span>,
              secondary:
                [
                  row.heldBy && `Held by ${row.heldBy}`,
                  row.responsible && `Responsible: ${memberLabel(row.responsible as MemberRef)}`,
                  row.document && `File: ${(row.document as { name: string }).name}`,
                  date(row.dueDate) && `needed by ${date(row.dueDate)}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined,
            })}
          />
        )}
        {section === 'criteria' && (
          <RegisterPanel
            projectId={projectId}
            register="design-criteria"
            title="Financial design criteria"
            procsa="QS 1.8 · engineers 1.9"
            description="Measurable cost targets the design must meet — cost limits per m², services and structural allowances, escalation, life-cycle and running-cost targets. The Stage 2 concept is checked against these."
            addLabel="Add criterion"
            onChange={changed}
            fields={[
              {
                name: 'category',
                label: 'Criterion',
                kind: 'text',
                required: true,
                suggestions: ['Building cost limit', 'Services allowance', 'Structural cost allowance', 'Escalation', 'Life-cycle cost', 'Energy / running cost', 'Contingency'],
              },
              { name: 'value', label: 'Value', kind: 'number' },
              { name: 'unit', label: 'Unit', kind: 'text', placeholder: 'e.g. R/m², % of construction, % p.a.' },
              { name: 'raisedById', label: 'Set by', kind: 'member' },
              { name: 'description', label: 'Explanation', kind: 'textarea', required: true },
            ]}
            renderRow={(row) => ({
              primary: (
                <span className="font-medium">
                  {String(row.category)}
                  {row.value != null && <span className="ml-2 tabular-nums text-slate-600 dark:text-slate-300">{Number(row.value).toLocaleString()} {row.unit ? String(row.unit) : ''}</span>}
                </span>
              ),
              secondary: [row.description, row.raisedBy && `Set by ${memberLabel(row.raisedBy as MemberRef)}`].filter(Boolean).join(' · ') || undefined,
            })}
          />
        )}
      </div>
    </div>
  );
}
