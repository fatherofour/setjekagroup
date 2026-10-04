'use client';

import { RegisterPanel, type FieldDef } from './RegisterPanel';
import { AdvicePanel } from './AdvicePanel';
import { formatMoney } from '@/lib/stage0';
import { STAGE_OPTIONS, memberLabel, type MemberRef } from '@/lib/inception';

const IMPACT_TONE: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  MEDIUM: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const CONSTRAINT_FIELDS: FieldDef[] = [
  {
    name: 'category',
    label: 'Category',
    kind: 'text',
    required: true,
    suggestions: ['Zoning & land use', 'Servitude', 'Title / legal', 'Geotechnical', 'Topography', 'Bulk services', 'Access & traffic', 'Environmental', 'Heritage', 'Neighbours'],
  },
  { name: 'impact', label: 'Impact', kind: 'select', options: [{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }] },
  { name: 'description', label: 'Characteristic, right or constraint', kind: 'textarea', required: true },
  { name: 'mitigation', label: 'Mitigation / design response', kind: 'textarea' },
  {
    name: 'status',
    label: 'Status',
    kind: 'select',
    options: [
      { value: 'OPEN', label: 'Open' },
      { value: 'MITIGATED', label: 'Mitigated' },
      { value: 'ACCEPTED', label: 'Accepted' },
      { value: 'RESOLVED', label: 'Resolved' },
    ],
  },
  { name: 'raisedById', label: 'Raised by', kind: 'member' },
];

const INVESTIGATION_FIELDS: FieldDef[] = [
  {
    name: 'investigationType',
    label: 'Survey / investigation',
    kind: 'text',
    required: true,
    suggestions: [
      'Topographical survey',
      'Geotechnical investigation',
      'Bulk services capacity study',
      'Traffic impact assessment',
      'Environmental impact assessment',
      'Heritage impact assessment',
      'Wetland delineation',
      'Existing building condition survey',
      'Electrical supply capacity',
    ],
  },
  { name: 'requiredByStage', label: 'Needed by stage', kind: 'select', options: STAGE_OPTIONS },
  { name: 'description', label: 'Why it is needed', kind: 'textarea' },
  { name: 'recommendedById', label: 'Recommended by', kind: 'member' },
  { name: 'responsibleId', label: 'Responsible', kind: 'member' },
  {
    name: 'status',
    label: 'Status',
    kind: 'select',
    options: [
      { value: 'RECOMMENDED', label: 'Recommended' },
      { value: 'COMMISSIONED', label: 'Commissioned' },
      { value: 'IN_PROGRESS', label: 'In progress' },
      { value: 'COMPLETED', label: 'Completed' },
      { value: 'NOT_REQUIRED', label: 'Not required' },
    ],
  },
  { name: 'dueDate', label: 'Due', kind: 'date' },
  { name: 'estimatedCost', label: 'Estimated cost', kind: 'number' },
  { name: 'findings', label: 'Findings', kind: 'textarea' },
];

/** PROCSA DM 1.2 "Facilitate preliminary site assessment", PM 1.4 (site
 * characteristics, rights and constraints), consultants 1.4 and the
 * engineers' 1.7 (surveys and investigations needed for Stage 2). */
export function SiteAssessmentSection({ projectId, currency, onChange }: { projectId: string; currency: string; onChange?: () => void }) {
  return (
    <div className="space-y-4">
      <RegisterPanel
        projectId={projectId}
        register="site-constraints"
        title="Site characteristics, rights & constraints"
        procsa="DM 1.2 · PM 1.4 · consultants 1.4"
        description="Everything about the site the design must respond to — zoning rights, servitudes, ground conditions, services, access, heritage."
        fields={CONSTRAINT_FIELDS}
        statusField="status"
        addLabel="Add constraint"
        onChange={onChange}
        renderRow={(row) => ({
          primary: (
            <>
              <span className="font-medium">{String(row.category)}</span> — {String(row.description)}
            </>
          ),
          secondary: [row.mitigation && `Response: ${row.mitigation}`, row.raisedBy && `Raised by ${memberLabel(row.raisedBy as MemberRef)}`].filter(Boolean).join(' · ') || undefined,
          badge: <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${IMPACT_TONE[String(row.impact)]}`}>{String(row.impact).toLowerCase()} impact</span>,
        })}
      />
      <RegisterPanel
        projectId={projectId}
        register="site-investigations"
        title="Surveys, analyses, tests & investigations"
        procsa="engineers 1.7"
        description="What must be surveyed or investigated before Concept, including the availability and location of infrastructure and services."
        fields={INVESTIGATION_FIELDS}
        statusField="status"
        addLabel="Add investigation"
        onChange={onChange}
        renderRow={(row) => ({
          primary: <span className="font-medium">{String(row.investigationType)}</span>,
          secondary:
            [
              row.recommendedBy && `Recommended by ${memberLabel(row.recommendedBy as MemberRef)}`,
              row.responsible && `Responsible: ${memberLabel(row.responsible as MemberRef)}`,
              row.estimatedCost != null && `Est. ${formatMoney(row.estimatedCost as number, currency)}`,
              row.dueDate && `Due ${new Date(String(row.dueDate)).toLocaleDateString()}`,
              row.findings && `Findings: ${row.findings}`,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
        })}
      />
      <AdvicePanel projectId={projectId} topics={['RIGHTS_CONSTRAINTS_CONSENTS', 'SURVEYS_INVESTIGATIONS']} title="Advice on rights, constraints and investigations" />
    </div>
  );
}
