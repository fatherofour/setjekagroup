import type { AdviceTopic, CommunicationKind, ConsentEventKind, CostPlanKind, InspectionKind, IssuePurpose, ProjectMemberRole, ProjectStage, ReportKind } from '../generated/prisma/enums.js';

/** PROCSA Stages 2 to 6 for the Development Manager and the Project Manager
 * (the user's direction, 25 Oct 2026: make sure both roles' responsibilities
 * are covered from Stage 0 to close-out). Text as in the client's PROCSA
 * Responsibility Matrix. Each item says what on the platform evidences it,
 * and where the work is done; anything done off the platform can be signed
 * off by hand with a note. */

export type DeliveryEvidence =
  | { kind: 'register'; register: string; category?: string[]; status?: string[]; min?: number; byRole?: boolean }
  | { kind: 'registerAllDone'; register: string; category: string[]; doneStatus: string[] }
  | { kind: 'meetings'; types: string[]; minutes?: boolean }
  | { kind: 'document'; match: RegExp; byRole?: boolean }
  | { kind: 'stageApproved'; from: ProjectStage }
  | { kind: 'consents'; status: string[] }
  | { kind: 'appointments'; rolesDefined?: boolean; role?: string }
  | { kind: 'hse' }
  | { kind: 'transmittals' }
  | { kind: 'revisionsReviewed'; approvedOnly?: boolean }
  | { kind: 'clientDocApprovals'; approvedOnly?: boolean }
  | { kind: 'decisions' }
  | { kind: 'rfqs'; status: string[] }
  | { kind: 'rfqWithDocuments' }
  | { kind: 'posIssued' }
  | { kind: 'budgetLocked' }
  | { kind: 'estimateFinal' }
  | { kind: 'variations'; decided?: boolean }
  | { kind: 'procurementPolicy' }
  | { kind: 'schedule'; beyondStage1?: boolean; baseline?: boolean; contractor?: boolean; progress?: boolean }
  | { kind: 'submittalsReviewed'; byRole?: boolean }
  | { kind: 'rfisAnswered'; byRole?: boolean }
  | { kind: 'report'; kinds: ReportKind[] }
  | { kind: 'paidInvoices' }
  // The architect's own work (byRole: done by someone holding the role).
  | { kind: 'drawings'; purposes?: IssuePurpose[]; byRole?: boolean }
  | { kind: 'docProgramme' }
  | { kind: 'drawingRegister' }
  | { kind: 'communications'; kinds: CommunicationKind[]; byRole?: boolean }
  | { kind: 'inspections'; kinds: InspectionKind[]; byRole?: boolean }
  | { kind: 'consentRounds'; events: ConsentEventKind[]; category?: RegExp; byRole?: boolean }
  | { kind: 'meetingsAttended'; types: string[] }
  | { kind: 'transmittalsByRole' }
  | { kind: 'registerReviewed'; register: string; category?: string[] }
  | { kind: 'punchItems'; closed?: boolean }
  // The QS's own work (2026-10-28).
  | { kind: 'costPlans'; kinds?: CostPlanKind[]; minRevision?: number; byRole?: boolean }
  | { kind: 'transmittalsReceived' }
  | { kind: 'variationsAssessed'; byRole?: boolean }
  | { kind: 'tenders'; status: string[] }
  | { kind: 'contracts' }
  | { kind: 'valuations'; status: string[]; final?: boolean; byRole?: boolean }
  // The engineers' own work (2026-10-29): Stage 1 registers carried on.
  | { kind: 'designCriteria' }
  | { kind: 'investigations' }
  | { kind: 'advice'; topics: AdviceTopic[] }
  | { kind: 'ncrs'; closed?: boolean }
  | { kind: 'any'; of: DeliveryEvidence[] }
  | { kind: 'all'; of: DeliveryEvidence[] }
  | { kind: 'manual' };

/** Where on the platform the work is done. */
export interface Go {
  tab: string;
  register?: string;
  label: string;
}

export interface DeliveryItem {
  code: string;
  text: string;
  evidence: DeliveryEvidence;
  /** Plain words for what ticks it. */
  tickedBy: string;
  go: Go;
}

export interface DeliveryRole {
  key: 'DEVELOPMENT_MANAGER' | 'PROJECT_MANAGER' | 'ARCHITECT' | 'QUANTITY_SURVEYOR' | 'CIVIL_ENGINEER' | 'STRUCTURAL_ENGINEER' | 'ELECTRICAL_ENGINEER' | 'MECHANICAL_ENGINEER';
  label: string;
  memberRoles: ProjectMemberRole[];
  items: DeliveryItem[];
}

export interface DeliveryStage {
  stage: ProjectStage;
  number: number;
  label: string;
  purpose: string;
  roles: DeliveryRole[];
}

const reg = (register: string, label: string): Go => ({ tab: 'registers', register, label });
const tab = (t: string, label: string): Go => ({ tab: t, label });
const procedure = (category: string): DeliveryEvidence => ({ kind: 'register', register: 'procedures', category: [category], status: ['AGREED'] });
const HS = /health\s*(and|&)\s*safety|h\s*&\s*s\b|\bshe\b/i;
const MANUAL = 'Sign it off here once done, with a note.';

const DM_ROLES: ProjectMemberRole[] = ['DEVELOPMENT_MANAGER'];
const PM_ROLES: ProjectMemberRole[] = ['PROJECT_MANAGER'];

export const DELIVERY_STAGES: DeliveryStage[] = [
  {
    stage: 'CONCEPT',
    number: 2,
    label: 'Concept & Viability',
    purpose: 'Prepare and finalise the project concept in accordance with the brief, including the scope, scale, character, form, function, preliminary programme and viability of the project.',
    roles: [
      {
        key: 'DEVELOPMENT_MANAGER',
        label: 'Development Manager',
        memberRoles: DM_ROLES,
        items: [
          { code: '2.1', text: 'Provide consultants with all supplementary information and constraints necessary to execute their respective obligations', evidence: { kind: 'transmittals' }, tickedBy: 'Documents issued to the team on a transmittal', go: tab('documents', 'Documents & transmittals') },
          { code: '2.2', text: 'Define format and procedures for reports, presentations and communications by all members of the project team', evidence: procedure('REPORTING_AND_COMMUNICATION'), tickedBy: 'An agreed reporting and communication procedure', go: reg('procedures', 'Project procedures') },
          { code: '2.3', text: 'Review and comment on proposals and reports prepared and presented by consultants including design concepts, costings and the like', evidence: { kind: 'revisionsReviewed' }, tickedBy: 'A consultant document or drawing reviewed', go: tab('documents', 'Documents') },
          { code: '2.4', text: 'Prepare "bankable business plan" including but not limited to a viability study, market research, end user commitments, operating agreements, marketing strategy and the like, for purposes of procuring finance for the project', evidence: { kind: 'any', of: [{ kind: 'document', match: /business\s*plan/i }, { kind: 'register', register: 'finance' }] }, tickedBy: 'A business plan document, or a finance facility being prepared', go: reg('finance', 'Project finance') },
          { code: '2.5', text: 'Manage procurement of project finance', evidence: { kind: 'register', register: 'finance', status: ['APPLIED', 'APPROVED_IN_PRINCIPLE', 'CONDITIONS_OUTSTANDING', 'CONDITIONS_MET', 'DRAWN'] }, tickedBy: 'A finance application made', go: reg('finance', 'Project finance') },
        ],
      },
      {
        key: 'PROJECT_MANAGER',
        label: 'Project Manager',
        memberRoles: PM_ROLES,
        items: [
          { code: '2.1', text: 'Assist the client in procurement of the other consultants', evidence: { kind: 'appointments' }, tickedBy: 'Consultants appointed', go: tab('inception', 'Professional team') },
          { code: '2.2', text: 'Advise the client on the requirement to appoint a health and safety consultant', evidence: { kind: 'hse' }, tickedBy: 'A health and safety manager or consultant on the team', go: tab('team', 'Team') },
          { code: '2.3', text: 'Communicate the project brief to the other consultants and monitor the development of the concept and viability', evidence: { kind: 'any', of: [{ kind: 'transmittals' }, { kind: 'meetings', types: ['DESIGN', 'CONSULTANTS'] }] }, tickedBy: 'The brief issued on a transmittal, or a design or consultants meeting', go: tab('meetings', 'Meetings') },
          { code: '2.4', text: 'Agree format and procedures for cost control and reporting by the other consultants', evidence: procedure('COST_CONTROL'), tickedBy: 'An agreed cost control procedure', go: reg('procedures', 'Project procedures') },
          { code: '2.5', text: 'Prepare a documentation programme and indicative construction programme', evidence: { kind: 'schedule', beyondStage1: true }, tickedBy: 'Programme activities beyond the Stage 1 programme', go: tab('schedule', 'Schedule') },
          { code: '2.6', text: 'Co-ordinate concept and viability documentation for presentation to the client for approval', evidence: { kind: 'clientDocApprovals' }, tickedBy: 'A document sent to the client for approval', go: tab('documents', 'Documents') },
          { code: '2.7', text: 'Facilitate approval of the concept and viability by the client', evidence: { kind: 'stageApproved', from: 'CONCEPT' }, tickedBy: 'The client approves the move from Concept to Design Development', go: tab('overview', 'Stage gate') },
          { code: '2.8', text: 'Facilitate approval of the concept and viability by statutory authorities', evidence: { kind: 'consents', status: ['APPROVED'] }, tickedBy: 'A consent approved', go: tab('inception', 'Consents & approvals') },
        ],
      },
    ],
  },
  {
    stage: 'DESIGN',
    number: 3,
    label: 'Design Development',
    purpose: 'Develop the approved concept to finalise the design, outline specifications, cost plan, financial viability and programme for the project.',
    roles: [
      {
        key: 'DEVELOPMENT_MANAGER',
        label: 'Development Manager',
        memberRoles: DM_ROLES,
        items: [
          { code: '3.1', text: 'Appoint balance of the consultants including the clear definition of their roles, responsibilities and liabilities', evidence: { kind: 'appointments', rolesDefined: true }, tickedBy: 'Every appointment has its roles and responsibilities', go: tab('inception', 'Professional team') },
          { code: '3.2', text: 'Review and approve formal and informal communication structure, processes and procedures for the design development of the project', evidence: procedure('DESIGN_COMMUNICATION'), tickedBy: 'An agreed design communication procedure', go: reg('procedures', 'Project procedures') },
          { code: '3.3', text: 'Review and approve detailed design and documentation programme, based on an updated indicative construction programme, with all consultants', evidence: { kind: 'schedule', baseline: true }, tickedBy: 'The programme baselined', go: tab('schedule', 'Schedule') },
          { code: '3.4', text: 'Obtain and timeously provide all operating end user requirements to the design team', evidence: { kind: 'document', match: /end[\s-]*user|user\s*requirement|operational\s*requirement/i }, tickedBy: 'An end-user requirements document', go: tab('documents', 'Documents') },
          { code: '3.5', text: 'Procure appropriate health and safety representative and advice', evidence: { kind: 'hse' }, tickedBy: 'A health and safety manager or consultant on the team', go: tab('team', 'Team') },
          { code: '3.6', text: 'Facilitate the timeous submission by the design team of all plans and documentation to obtain the necessary statutory approvals', evidence: { kind: 'consents', status: ['SUBMITTED', 'APPROVED'] }, tickedBy: 'A consent submitted', go: tab('inception', 'Consents & approvals') },
          { code: '3.7', text: 'Provide design and cost decisions timeously in relation to the design development process', evidence: { kind: 'decisions' }, tickedBy: 'Decisions signed off on the platform', go: tab('overview', 'Approvals') },
          { code: '3.8', text: 'Receive, review and agree estimates, budgets and cost reports in relation to the final capital cost of the project', evidence: { kind: 'any', of: [{ kind: 'estimateFinal' }, { kind: 'budgetLocked' }] }, tickedBy: 'A final estimate, or the budget locked', go: tab('commercial', 'Commercial') },
          { code: '3.9', text: 'Establish, monitor and manage cash flow requirements of the project', evidence: { kind: 'register', register: 'cash-flow' }, tickedBy: 'A cash flow forecast', go: reg('cash-flow', 'Cash flow') },
          { code: '3.10', text: 'Review and approve designs by consultants', evidence: { kind: 'any', of: [{ kind: 'revisionsReviewed', approvedOnly: true }, { kind: 'clientDocApprovals', approvedOnly: true }] }, tickedBy: 'A design approved', go: tab('documents', 'Documents') },
          { code: '3.11', text: 'Review facilities management requirements and establish facilities management policy', evidence: procedure('FACILITIES_MANAGEMENT'), tickedBy: 'An agreed facilities management policy', go: reg('procedures', 'Project procedures') },
          { code: '3.12', text: 'Monitor implementation of the marketing strategy', evidence: { kind: 'any', of: [{ kind: 'register', register: 'sales-leasing' }, { kind: 'document', match: /marketing/i }] }, tickedBy: 'Units on the sales and leasing register, or a marketing document', go: reg('sales-leasing', 'Sales and leasing') },
          { code: '3.13', text: 'Procure and approve the marketing documentation', evidence: { kind: 'document', match: /marketing|brochure/i }, tickedBy: 'A marketing document', go: tab('documents', 'Documents') },
          { code: '3.14', text: 'Manage achievement of the business plan income stream requirements', evidence: { kind: 'register', register: 'sales-leasing', status: ['RESERVED', 'SIGNED'] }, tickedBy: 'A unit reserved or signed', go: reg('sales-leasing', 'Sales and leasing') },
          { code: '3.15', text: 'Procure achievement of all project finance preconditions', evidence: { kind: 'register', register: 'finance', status: ['CONDITIONS_MET', 'DRAWN'] }, tickedBy: 'Finance preconditions met', go: reg('finance', 'Project finance') },
        ],
      },
      {
        key: 'PROJECT_MANAGER',
        label: 'Project Manager',
        memberRoles: PM_ROLES,
        items: [
          { code: '3.1', text: 'Agree and implement communication processes and procedures for the design development of the project', evidence: procedure('DESIGN_COMMUNICATION'), tickedBy: 'An agreed design communication procedure', go: reg('procedures', 'Project procedures') },
          { code: '3.2', text: 'Assist the client in the procurement of the necessary other consultants including the clear definition of their roles and responsibilities', evidence: { kind: 'appointments', rolesDefined: true }, tickedBy: 'Every appointment has its roles and responsibilities', go: tab('inception', 'Professional team') },
          { code: '3.3', text: 'Prepare, co-ordinate, agree and monitor a detailed design and documentation program', evidence: { kind: 'schedule', baseline: true }, tickedBy: 'The programme baselined', go: tab('schedule', 'Schedule') },
          { code: '3.4', text: "Conduct and record consultants' and management meetings", evidence: { kind: 'meetings', types: ['DESIGN', 'CONSULTANTS'], minutes: true }, tickedBy: 'Minutes issued for a design or consultants meeting', go: tab('meetings', 'Meetings') },
          { code: '3.5', text: 'Facilitate input required by health and safety consultant', evidence: { kind: 'any', of: [{ kind: 'document', match: HS }, { kind: 'hse' }] }, tickedBy: 'A health and safety document, or an H&S consultant on the team', go: tab('documents', 'Documents') },
          { code: '3.6', text: 'Facilitate design reviews for compliance and cost control', evidence: { kind: 'revisionsReviewed' }, tickedBy: 'A design document reviewed', go: tab('documents', 'Documents') },
          { code: '3.7', text: 'Facilitate timeous technical co-ordination', evidence: { kind: 'any', of: [{ kind: 'rfisAnswered' }, { kind: 'meetings', types: ['DESIGN'] }] }, tickedBy: 'An RFI answered, or a design meeting', go: tab('technical', 'RFIs & submittals') },
          { code: '3.8', text: 'Facilitate client approval of all stage 3 documentation', evidence: { kind: 'stageApproved', from: 'DESIGN' }, tickedBy: 'The client approves the move from Design Development', go: tab('overview', 'Stage gate') },
        ],
      },
    ],
  },
  {
    stage: 'DOCUMENTATION_PROCUREMENT',
    number: 4,
    label: 'Documentation & Procurement',
    purpose: 'Prepare the construction and procurement documentation, confirm and implement the procurement strategies and procedures for effective and timeous procurement of necessary resources for the execution of the project.',
    roles: [
      {
        key: 'DEVELOPMENT_MANAGER',
        label: 'Development Manager',
        memberRoles: DM_ROLES,
        items: [
          { code: '4.1', text: 'Review and approve procurement strategy for contractors, subcontractors and suppliers', evidence: { kind: 'procurementPolicy' }, tickedBy: 'The procurement policy (delivery strategy) on file', go: tab('inception', 'Procurement policy') },
          { code: '4.2', text: 'Review and approve project procurement programme and proposed tenderers', evidence: { kind: 'rfqs', status: ['ISSUED', 'CLOSED', 'AWARDED'] }, tickedBy: 'An RFQ issued to tenderers', go: tab('procurement', 'Procurement') },
          { code: '4.3', text: 'Receive and review environmental management plan', evidence: { kind: 'document', match: /environmental\s*management|\bemp\b/i }, tickedBy: 'An environmental management plan document', go: tab('documents', 'Documents') },
          { code: '4.4', text: 'Provide all necessary, project specific tender conditions including but not limited to, amendments and additions to the preliminaries, empowerment policies, insurance and payment conditions and the like to incorporation in the tender documentation', evidence: procedure('TENDER_CONDITIONS'), tickedBy: 'Agreed project-specific tender conditions', go: reg('procedures', 'Project procedures') },
          { code: '4.5', text: 'Review health and safety specification for the project', evidence: { kind: 'document', match: /(health\s*(and|&)\s*safety|h\s*&\s*s).*(spec)/i }, tickedBy: 'A health and safety specification document', go: tab('documents', 'Documents') },
          { code: '4.6', text: 'Review adjudication of tenders and instructions to the principal agent to appoint the appropriate contractors', evidence: { kind: 'rfqs', status: ['AWARDED'] }, tickedBy: 'An RFQ awarded', go: tab('procurement', 'Procurement') },
          { code: '4.7', text: 'Sign all principal and direct contract appointment on project', evidence: { kind: 'posIssued' }, tickedBy: 'A purchase order or contract issued', go: tab('procurement', 'Procurement') },
          { code: '4.8', text: 'Place the necessary insurance for project including contractor insurance and appropriate development risk insurance', evidence: { kind: 'register', register: 'insurances', status: ['IN_FORCE', 'CLAIM_OPEN'] }, tickedBy: 'An insurance in force', go: reg('insurances', 'Insurances') },
          { code: '4.9', text: 'Review reconciliation by quantity surveyor of the tender prices with project budget', evidence: { kind: 'all', of: [{ kind: 'budgetLocked' }, { kind: 'rfqs', status: ['AWARDED'] }] }, tickedBy: 'The budget locked and a tender awarded (the cost report reconciles them)', go: tab('commercial', 'Cost report') },
          { code: '4.10', text: 'Agree format and procedures for monitoring and control by quantity surveyor of cost of the scope of works', evidence: procedure('COST_CONTROL'), tickedBy: 'An agreed cost control procedure', go: reg('procedures', 'Project procedures') },
          { code: '4.11', text: 'Monitor leasing / sales performance relative to project feasibility', evidence: { kind: 'register', register: 'sales-leasing' }, tickedBy: 'The sales and leasing register in use', go: reg('sales-leasing', 'Sales and leasing') },
          { code: '4.12', text: 'Procure and manage legal advice in relation to project leasing, sales, etc', evidence: { kind: 'document', match: /legal|lease\s*agreement|sale\s*agreement|offer\s*to\s*purchase/i }, tickedBy: 'A legal, lease or sale agreement document', go: tab('documents', 'Documents') },
          { code: '4.13', text: 'Formalise all service agreements with the appropriate authorities including the payment of all necessary deposits', evidence: { kind: 'register', register: 'service-agreements', status: ['AGREED', 'DEPOSIT_PAID'] }, tickedBy: 'A service agreement concluded', go: reg('service-agreements', 'Authority service agreements') },
        ],
      },
      {
        key: 'PROJECT_MANAGER',
        label: 'Project Manager',
        memberRoles: PM_ROLES,
        items: [
          { code: '4.1', text: 'Recommend and agree procurement strategy for contractors, subcontractors and suppliers with the client and the other consultants', evidence: { kind: 'procurementPolicy' }, tickedBy: 'The procurement policy (delivery strategy) on file', go: tab('inception', 'Procurement policy') },
          { code: '4.2', text: 'Prepare and agree the procurement programme', evidence: { kind: 'rfqs', status: ['ISSUED', 'CLOSED', 'AWARDED'] }, tickedBy: 'An RFQ issued', go: tab('procurement', 'Procurement') },
          { code: '4.3', text: 'Advise the client, in conjunction with the other consultants on the appropriate insurances', evidence: { kind: 'register', register: 'insurances' }, tickedBy: 'Insurances listed on the register', go: reg('insurances', 'Insurances') },
          { code: '4.4', text: 'Co-ordinate and monitor preparation of procurement documentation by consultants in accordance with the project procurement programme', evidence: { kind: 'rfqWithDocuments' }, tickedBy: 'An RFQ with its tender documents or priced items', go: tab('procurement', 'Procurement') },
          { code: '4.5', text: 'Manage procurement process and recommended contractors for approval by the client', evidence: { kind: 'rfqs', status: ['AWARDED'] }, tickedBy: 'An RFQ evaluated and awarded', go: tab('procurement', 'Procurement') },
          { code: '4.6', text: 'Agree the format and procedures for monitoring and control by the quantity surveyor of the cost of the works', evidence: procedure('COST_CONTROL'), tickedBy: 'An agreed cost control procedure', go: reg('procedures', 'Project procedures') },
          { code: '4.7', text: 'Co-ordinate and assemble the contract documentation for signature', evidence: { kind: 'any', of: [{ kind: 'posIssued' }, { kind: 'document', match: /contract/i }] }, tickedBy: 'A purchase order issued, or a contract document', go: tab('procurement', 'Procurement') },
        ],
      },
    ],
  },
  {
    stage: 'CONSTRUCTION',
    number: 5,
    label: 'Construction',
    purpose: 'Manage, administer and monitor the contracts and processes, including the preparation and co-ordination of the procedures and documentation to facilitate practical completion of the works.',
    roles: [
      {
        key: 'DEVELOPMENT_MANAGER',
        label: 'Development Manager',
        memberRoles: DM_ROLES,
        items: [
          { code: '5.1', text: 'Manage ongoing projects insurance requirements (including resolution of all insurance claims)', evidence: { kind: 'register', register: 'insurances', status: ['IN_FORCE', 'CLAIM_OPEN'] }, tickedBy: 'Insurances in force on the register', go: reg('insurances', 'Insurances') },
          { code: '5.2', text: 'Formalise and facilitate occupation of site by contractor, including but not limited to termination of existing leases and the like', evidence: { kind: 'register', register: 'certificates', category: ['SITE_HANDOVER'] }, tickedBy: 'Site handover recorded', go: reg('certificates', 'Handover and completion') },
          { code: '5.3', text: 'Review formal and informal communication structure and procedures for construction process', evidence: procedure('CONSTRUCTION_COMMUNICATION'), tickedBy: 'An agreed construction communication procedure', go: reg('procedures', 'Project procedures') },
          { code: '5.4', text: 'Regularly attend site meetings and inspections', evidence: { kind: 'meetings', types: ['SITE'] }, tickedBy: 'Site meetings held', go: tab('meetings', 'Meetings') },
          { code: '5.5', text: "Receive and review contractors' health and safety plan", evidence: { kind: 'document', match: /(health\s*(and|&)\s*safety|h\s*&\s*s|safety).*plan/i }, tickedBy: "The contractor's health and safety plan on file", go: tab('documents', 'Documents') },
          { code: '5.6', text: 'Review and approve "end user" specific construction details, documentation, and materials timeously', evidence: { kind: 'submittalsReviewed' }, tickedBy: 'A submittal reviewed', go: tab('technical', 'RFIs & submittals') },
          { code: '5.7', text: 'Review and approve all scope and cost variations', evidence: { kind: 'variations', decided: true }, tickedBy: 'Variations decided', go: tab('commercial', 'Variations') },
          { code: '5.8', text: 'Arbitrate acceptable standards of quality when required to do so', evidence: { kind: 'manual' }, tickedBy: MANUAL, go: tab('issues', 'Issues') },
          { code: '5.9', text: 'Review and process monthly progress payments', evidence: { kind: 'any', of: [{ kind: 'register', register: 'payment-certificates', status: ['ISSUED', 'PAID'] }, { kind: 'paidInvoices' }] }, tickedBy: 'A payment certificate issued, or a supplier invoice paid', go: reg('payment-certificates', 'Payment certificates') },
          { code: '5.10', text: 'Receive, review and approve recommendations for settlement of contractual claims as prepared by the principal agent', evidence: { kind: 'register', register: 'claims', status: ['AGREED', 'REJECTED'] }, tickedBy: 'A claim settled', go: reg('claims', 'Contractual claims') },
          { code: '5.11', text: 'Receive and review monthly cost reports', evidence: { kind: 'all', of: [{ kind: 'budgetLocked' }, { kind: 'report', kinds: ['PROGRESS_PPTX', 'SUMMARY_PDF', 'EXCEL_EXPORT'] }] }, tickedBy: 'The budget locked and a report generated', go: tab('reports', 'Reports') },
          { code: '5.12', text: 'Formalise management of all direct contractors and suppliers', evidence: { kind: 'posIssued' }, tickedBy: 'Purchase orders issued', go: tab('procurement', 'Procurement') },
          { code: '5.13', text: 'Receive and review all project reports and present same at client review meetings', evidence: { kind: 'all', of: [{ kind: 'report', kinds: ['PROGRESS_PPTX', 'SUMMARY_PDF'] }, { kind: 'meetings', types: ['CLIENT'] }] }, tickedBy: 'A progress report generated, and a client meeting held', go: tab('reports', 'Reports') },
          { code: '5.14', text: 'Provide operator input for any necessary early testing and commissioning by consultants and contractors', evidence: { kind: 'document', match: /commission/i }, tickedBy: 'A commissioning document', go: tab('documents', 'Documents') },
        ],
      },
      {
        key: 'PROJECT_MANAGER',
        label: 'Project Manager',
        memberRoles: PM_ROLES,
        items: [
          { code: '5.1', text: 'Arrange site handover to the contractor', evidence: { kind: 'register', register: 'certificates', category: ['SITE_HANDOVER'] }, tickedBy: 'Site handover recorded', go: reg('certificates', 'Handover and completion') },
          { code: '5.2', text: 'Establish construction documentation issue process', evidence: procedure('DOCUMENT_ISSUE'), tickedBy: 'An agreed document issue procedure', go: reg('procedures', 'Project procedures') },
          { code: '5.3', text: 'Agree and monitor issue and distribution of construction docs', evidence: { kind: 'transmittals' }, tickedBy: 'Construction documents issued on a transmittal', go: tab('documents', 'Transmittals') },
          { code: '5.4', text: 'Instruct the contractor on behalf of the client to appoint subcontractors', evidence: { kind: 'appointments', role: 'SUBCONTRACTOR' }, tickedBy: 'A subcontractor appointed', go: tab('procurement', 'Procurement') },
          { code: '5.5', text: 'Conduct and record site meetings', evidence: { kind: 'meetings', types: ['SITE'], minutes: true }, tickedBy: 'Minutes issued for a site meeting', go: tab('meetings', 'Meetings') },
          { code: '5.6', text: 'Monitor, review and approve the preparation of the construction programme by the contractor', evidence: { kind: 'schedule', contractor: true }, tickedBy: 'Programme activities assigned to a contractor', go: tab('schedule', 'Schedule') },
          { code: '5.7', text: 'Regularly monitor performance of the contractor against the programme', evidence: { kind: 'schedule', baseline: true, progress: true }, tickedBy: 'A baselined programme with progress recorded', go: tab('schedule', 'Schedule') },
          { code: '5.8', text: 'Adjudicate entitlements that arise from changes required to the construction programme', evidence: { kind: 'register', register: 'claims', status: ['RECOMMENDED', 'AGREED', 'REJECTED'] }, tickedBy: 'A claim adjudicated', go: reg('claims', 'Contractual claims') },
          { code: '5.9', text: 'Receive, co-ordinate and monitor approval of all contract documentation provided by contractor(s)', evidence: { kind: 'submittalsReviewed' }, tickedBy: 'A contractor submittal reviewed', go: tab('technical', 'RFIs & submittals') },
          { code: '5.10', text: 'Agree quality assurance procedures and monitor implementation thereof by the other consultants and the contractors', evidence: { kind: 'all', of: [procedure('QUALITY_ASSURANCE'), { kind: 'any', of: [{ kind: 'ncrs' }, { kind: 'inspections', kinds: ['QUALITY', 'DESIGN_SUPERVISION'] }] }] }, tickedBy: 'An agreed quality assurance procedure, with inspections or NCRs showing it in use', go: reg('procedures', 'Project procedures') },
          { code: '5.11', text: "Monitor preparation and auditing of the contractor's health and safety plan and approval thereof by the H&S consultant", evidence: { kind: 'document', match: /(health\s*(and|&)\s*safety|h\s*&\s*s|safety).*plan/i }, tickedBy: "The contractor's health and safety plan on file", go: tab('documents', 'Documents') },
          { code: '5.12', text: 'Monitor preparation of the environmental management plan by the environmental consultant', evidence: { kind: 'document', match: /environmental\s*management|\bemp\b/i }, tickedBy: 'An environmental management plan document', go: tab('documents', 'Documents') },
          { code: '5.13', text: 'Establish procedures for monitoring scope and cost variations', evidence: { kind: 'any', of: [procedure('VARIATION_CONTROL'), { kind: 'variations' }] }, tickedBy: 'An agreed variation control procedure, or variations raised', go: tab('commercial', 'Variations') },
          { code: '5.14', text: 'Monitor, review, approve and issue certificates', evidence: { kind: 'register', register: 'payment-certificates', status: ['ISSUED', 'PAID'] }, tickedBy: 'A payment certificate issued', go: reg('payment-certificates', 'Payment certificates') },
          { code: '5.15', text: 'Receive, review and adjudicate any contractual claims', evidence: { kind: 'register', register: 'claims', status: ['RECOMMENDED', 'AGREED', 'REJECTED'] }, tickedBy: 'A claim adjudicated', go: reg('claims', 'Contractual claims') },
          { code: '5.16', text: 'Monitor preparation of financial control reports by the other consultants', evidence: { kind: 'budgetLocked' }, tickedBy: 'The budget locked, so the cost report tracks against it', go: tab('commercial', 'Cost report') },
          { code: '5.17', text: 'Prepare and submit progress reports', evidence: { kind: 'report', kinds: ['PROGRESS_PPTX', 'SUMMARY_PDF'] }, tickedBy: 'A progress report generated', go: tab('reports', 'Reports') },
          { code: '5.18', text: 'Coordinate, monitor and issue practical completion lists and the certificate of practical completion', evidence: { kind: 'register', register: 'certificates', category: ['PRACTICAL_COMPLETION'], status: ['ISSUED', 'ACCEPTED'] }, tickedBy: 'The certificate of practical completion issued', go: reg('certificates', 'Handover and completion') },
        ],
      },
    ],
  },
  {
    stage: 'CLOSEOUT',
    number: 6,
    label: 'Close-out',
    purpose: 'Fulfil and complete the project close-out including the preparation of the necessary documentation to facilitate effective completion, handover and operation of the project.',
    roles: [
      {
        key: 'DEVELOPMENT_MANAGER',
        label: 'Development Manager',
        memberRoles: DM_ROLES,
        items: [
          { code: '6.1', text: 'Accept works completion certificate', evidence: { kind: 'register', register: 'certificates', category: ['WORKS_COMPLETION'], status: ['ACCEPTED'] }, tickedBy: 'Works completion accepted', go: reg('certificates', 'Handover and completion') },
          { code: '6.2', text: 'Receive and distribute all as-built drawings and design documentation, to appropriate parties', evidence: { kind: 'register', register: 'handover-documents', category: ['AS_BUILT'], status: ['DISTRIBUTED'] }, tickedBy: 'As-built drawings distributed', go: reg('handover-documents', 'Handover documents') },
          { code: '6.3', text: 'Receive and distribute, all operating and maintenance manuals as well as all warrantees and guarantees, to appropriate parties', evidence: { kind: 'register', register: 'handover-documents', category: ['O_AND_M_MANUAL', 'WARRANTY', 'GUARANTEE'], status: ['DISTRIBUTED'] }, tickedBy: 'O&M manuals, warranties or guarantees distributed', go: reg('handover-documents', 'Handover documents') },
          { code: '6.4', text: 'Receive and distribute, all statutory compliance certificates and documentation, to appropriate parties', evidence: { kind: 'register', register: 'handover-documents', category: ['STATUTORY_CERTIFICATE'], status: ['DISTRIBUTED'] }, tickedBy: 'Statutory certificates distributed', go: reg('handover-documents', 'Handover documents') },
          { code: '6.5', text: 'Receive and handover health and safety files to client', evidence: { kind: 'register', register: 'handover-documents', category: ['HEALTH_AND_SAFETY_FILE'], status: ['DISTRIBUTED'] }, tickedBy: 'The health and safety file handed over', go: reg('handover-documents', 'Handover documents') },
          { code: '6.6', text: 'Monitor rectification of defects during defects liability period', evidence: { kind: 'registerAllDone', register: 'defects', category: ['DEFECTS_LIABILITY'], doneStatus: ['VERIFIED'] }, tickedBy: 'Every defects-liability defect verified', go: reg('defects', 'Defects') },
          { code: '6.7', text: 'Monitor preparation and agreement of the final accounts', evidence: { kind: 'register', register: 'final-accounts', status: ['AGREED'] }, tickedBy: 'A final account agreed', go: reg('final-accounts', 'Final accounts') },
          { code: '6.8', text: 'Procure and distribute end users latent final completion defects list for inclusion in project final completion latent defects list', evidence: { kind: 'register', register: 'defects', category: ['LATENT'] }, tickedBy: 'Latent defects listed', go: reg('defects', 'Defects') },
          { code: '6.9', text: 'Receive and review and present project closeout report to client', evidence: { kind: 'report', kinds: ['CLOSEOUT_PDF'] }, tickedBy: 'A close-out report generated', go: tab('reports', 'Reports') },
          { code: '6.10', text: 'Assist the client in procuring appropriate facilities management resources', evidence: { kind: 'manual' }, tickedBy: MANUAL, go: reg('procedures', 'Facilities management policy') },
        ],
      },
      {
        key: 'PROJECT_MANAGER',
        label: 'Project Manager',
        memberRoles: PM_ROLES,
        items: [
          { code: '6.1', text: 'Co-ordinate and monitor rectification of defects', evidence: { kind: 'register', register: 'defects', status: ['RECTIFIED', 'VERIFIED'] }, tickedBy: 'Defects rectified', go: reg('defects', 'Defects') },
          { code: '6.2', text: 'Manage procurement of operations and maintenance manuals, guarantees and warranties', evidence: { kind: 'register', register: 'handover-documents', category: ['O_AND_M_MANUAL', 'WARRANTY', 'GUARANTEE'], status: ['RECEIVED', 'DISTRIBUTED'] }, tickedBy: 'O&M manuals, warranties or guarantees received', go: reg('handover-documents', 'Handover documents') },
          { code: '6.3', text: 'Manage preparation of as-built drawings and documentation', evidence: { kind: 'register', register: 'handover-documents', category: ['AS_BUILT'], status: ['RECEIVED', 'DISTRIBUTED'] }, tickedBy: 'As-built drawings received', go: reg('handover-documents', 'Handover documents') },
          { code: '6.4', text: 'Manage procurement of outstanding statutory certificates', evidence: { kind: 'register', register: 'handover-documents', category: ['STATUTORY_CERTIFICATE'], status: ['RECEIVED', 'DISTRIBUTED'] }, tickedBy: 'Statutory certificates received', go: reg('handover-documents', 'Handover documents') },
          { code: '6.5', text: 'Monitor, review and issue payment certificates', evidence: { kind: 'register', register: 'payment-certificates', status: ['ISSUED', 'PAID'] }, tickedBy: 'Payment certificates issued', go: reg('payment-certificates', 'Payment certificates') },
          { code: '6.6', text: 'Issue completion certificates', evidence: { kind: 'register', register: 'certificates', category: ['WORKS_COMPLETION', 'FINAL_COMPLETION'], status: ['ISSUED', 'ACCEPTED'] }, tickedBy: 'A works or final completion certificate issued', go: reg('certificates', 'Handover and completion') },
          { code: '6.7', text: 'Manage agreement of final account(s)', evidence: { kind: 'register', register: 'final-accounts', status: ['AGREED'] }, tickedBy: 'A final account agreed', go: reg('final-accounts', 'Final accounts') },
          { code: '6.8', text: 'Prepare and present the project close-out report', evidence: { kind: 'report', kinds: ['CLOSEOUT_PDF'] }, tickedBy: 'A close-out report generated', go: tab('reports', 'Reports') },
        ],
      },
    ],
  },
];

// PROCSA Architect, Stages 2 to 6 (the user, 26 Oct 2026: build for the
// architect role). Text as in the client's PROCSA Responsibility Matrix,
// with its spelling slips corrected. Most items tick from the architect's
// own records - drawings issued, instructions drafted, inspections done,
// meetings attended - and the rest are signed off by hand.
const ARCH_ROLES: ProjectMemberRole[] = ['ARCHITECT', 'ARCHITECT_ENGINEER'];
const DESIGN_MEETINGS: DeliveryEvidence = { kind: 'meetingsAttended', types: ['DESIGN', 'CONSULTANTS'] };
const LIAISE: DeliveryEvidence = { kind: 'any', of: [{ kind: 'transmittalsByRole' }, { kind: 'communications', kinds: ['CORRESPONDENCE', 'CONTRACT_INSTRUCTION'], byRole: true }] };
const SDP = /site\s*development|\bSDP\b/i;
const BUILDING_PLANS = /building\s*plan/i;
const STATUTORY = /occupan|certificate|fire|statutory/i;
const MEET = tab('meetings', 'Meetings');
const DRAWINGS = tab('drawings', 'Drawings');
const AUTHORITIES = tab('authorities', 'Authorities');

const ARCHITECT_ITEMS: Partial<Record<ProjectStage, DeliveryItem[]>> = {
  CONCEPT: [
    { code: '2.1', text: 'Agree the documentation programme with the principal consultant and the other consultants', evidence: { kind: 'docProgramme' }, tickedBy: 'Drawings planned on the documentation programme', go: DRAWINGS },
    { code: '2.2', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '2.3', text: "Prepare concept design based on the client's brief", evidence: { kind: 'drawings', purposes: ['FOR_INFORMATION', 'FOR_COMMENT', 'FOR_CLIENT_APPROVAL'], byRole: true }, tickedBy: 'Concept drawings on the register', go: DRAWINGS },
    { code: '2.4', text: 'Consult with the other consultants and incorporate their input', evidence: { kind: 'meetingsAttended', types: ['CONSULTANTS'] }, tickedBy: 'Marked present at a consultants meeting', go: MEET },
    { code: '2.5', text: 'Discuss design concept with local authorities', evidence: { kind: 'consentRounds', events: ['SUBMITTED', 'NOTE', 'COMMENTS_RECEIVED'] }, tickedBy: 'A round with an authority recorded', go: AUTHORITIES },
    { code: '2.6', text: 'Clarify and confirm the project space norms to optimise functional and operational efficiency in terms of scale and relationships of areas', evidence: { kind: 'any', of: [{ kind: 'register', register: 'area-schedule' }, { kind: 'document', match: /space\s*norm|area\s*schedule|accommodation\s*schedule/i }] }, tickedBy: 'Spaces on the area schedule', go: reg('area-schedule', 'Area schedule') },
    { code: '2.7', text: 'Co-ordinate design interfaces with the other consultants', evidence: { kind: 'any', of: [{ kind: 'drawings', purposes: ['FOR_COORDINATION'], byRole: true }, { kind: 'meetingsAttended', types: ['CONSULTANTS'] }] }, tickedBy: 'Drawings issued for co-ordination, or a consultants meeting attended', go: DRAWINGS },
    { code: '2.8', text: 'Select general construction materials and intended finishes', evidence: { kind: 'any', of: [{ kind: 'register', register: 'finishes' }, { kind: 'document', match: /finish|material\s*schedule/i }] }, tickedBy: 'Finishes on the finishes schedule', go: reg('finishes', 'Finishes schedule') },
    { code: '2.9', text: 'Provide information to the quantity surveyor for suitable estimates of construction costs', evidence: { kind: 'transmittalsByRole' }, tickedBy: 'Drawings or information issued on a transmittal', go: tab('documents', 'Transmittals') },
    { code: '2.10', text: 'Prepare and submit presentation of the design concept to the client for approval', evidence: { kind: 'clientDocApprovals' }, tickedBy: 'The concept sent to the client for approval', go: tab('documents', 'Documents') },
    { code: '2.11', text: 'Prepare and submit the site development plan to the local authority for approval where applicable', evidence: { kind: 'consentRounds', events: ['SUBMITTED', 'RESUBMITTED'], category: SDP }, tickedBy: 'The site development plan submitted', go: AUTHORITIES },
    { code: '2.12', text: 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants', evidence: LIAISE, tickedBy: 'A transmittal or letter from the architect', go: tab('instructions', 'Instructions') },
  ],
  DESIGN: [
    { code: '3.1', text: 'Review the documentation programme with the principal consultant and the other consultants', evidence: { kind: 'docProgramme' }, tickedBy: 'Drawings planned on the documentation programme', go: DRAWINGS },
    { code: '3.2', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '3.3', text: "Incorporate the client's detailed requirements into building design", evidence: { kind: 'clientDocApprovals', approvedOnly: true }, tickedBy: 'A design approved by the client', go: tab('documents', 'Documents') },
    { code: '3.4', text: "Incorporate and co-ordinate the other consultants' designs into building design", evidence: { kind: 'drawings', purposes: ['FOR_COORDINATION'], byRole: true }, tickedBy: 'Drawings issued for co-ordination', go: DRAWINGS },
    { code: '3.5', text: 'Prepare design development drawings including draft technical details and outline specifications', evidence: { kind: 'drawings', purposes: ['FOR_COMMENT', 'FOR_CLIENT_APPROVAL', 'FOR_COORDINATION'], byRole: true }, tickedBy: 'Design development drawings on the register', go: DRAWINGS },
    { code: '3.6', text: 'Review budget in conjunction with the quantity surveyor', evidence: { kind: 'any', of: [{ kind: 'estimateFinal' }, { kind: 'budgetLocked' }] }, tickedBy: 'A final estimate, or the budget locked', go: tab('commercial', 'Commercial') },
    { code: '3.7', text: 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants', evidence: LIAISE, tickedBy: 'A transmittal or letter from the architect', go: tab('instructions', 'Instructions') },
    { code: '3.8', text: 'Submit drawings to local authorities for approval', evidence: { kind: 'any', of: [{ kind: 'consentRounds', events: ['SUBMITTED', 'RESUBMITTED'], category: BUILDING_PLANS }, { kind: 'drawings', purposes: ['FOR_AUTHORITY_SUBMISSION'], byRole: true }] }, tickedBy: 'Building plans submitted to the authority', go: AUTHORITIES },
  ],
  DOCUMENTATION_PROCUREMENT: [
    { code: '4.1', text: 'Attend design and consultants meetings', evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '4.2', text: 'Prepare specifications for the works and agree preambles with the quantity surveyor', evidence: { kind: 'document', match: /specification|preamble/i }, tickedBy: 'A specification on file', go: tab('documents', 'Documents') },
    { code: '4.3', text: 'Co-ordinate services and prepare necessary services co-ordination drawings', evidence: { kind: 'drawings', purposes: ['FOR_COORDINATION'], byRole: true }, tickedBy: 'Co-ordination drawings issued', go: DRAWINGS },
    { code: '4.4', text: 'Check cost estimate with the quantity surveyor and adjust documents if necessary to remain within budget', evidence: { kind: 'any', of: [{ kind: 'estimateFinal' }, { kind: 'budgetLocked' }] }, tickedBy: 'A final estimate, or the budget locked', go: tab('commercial', 'Commercial') },
    { code: '4.5', text: 'Provide working drawings to the quantity surveyor for preparation of procurement documentation', evidence: { kind: 'drawings', purposes: ['FOR_PROCUREMENT'], byRole: true }, tickedBy: 'Drawings issued for procurement', go: DRAWINGS },
    { code: '4.6', text: 'Liaise, co-operate and provide necessary information to the principal consultant and the other consultants', evidence: LIAISE, tickedBy: 'A transmittal or letter from the architect', go: tab('instructions', 'Instructions') },
    { code: '4.7', text: 'Assist with evaluation of tenders', evidence: { kind: 'rfqs', status: ['AWARDED'] }, tickedBy: 'A tender evaluated and awarded', go: tab('procurement', 'Procurement') },
    { code: '4.8', text: 'Assist with the preparation of contract documentation for signature', evidence: { kind: 'document', match: /contract|agreement/i }, tickedBy: 'Contract documentation on file', go: tab('documents', 'Documents') },
    { code: '4.9', text: 'Assess samples and products for compliance and design intent', evidence: { kind: 'any', of: [{ kind: 'register', register: 'finishes', status: ['APPROVED', 'REJECTED'] }, { kind: 'submittalsReviewed', byRole: true }, { kind: 'inspections', kinds: ['MOCK_UP'] }] }, tickedBy: 'A sample decided on the finishes schedule, a sample submittal reviewed, or a mock-up inspected', go: reg('finishes', 'Finishes schedule') },
  ],
  CONSTRUCTION: [
    { code: '5.1', text: 'Attend the site handover', evidence: { kind: 'register', register: 'certificates', category: ['SITE_HANDOVER'] }, tickedBy: 'The site handover recorded', go: reg('certificates', 'Handover and completion') },
    { code: '5.2', text: 'Issue construction documentation in accordance with the documentation programme', evidence: { kind: 'drawings', purposes: ['FOR_CONSTRUCTION'], byRole: true }, tickedBy: 'Drawings issued for construction', go: DRAWINGS },
    { code: '5.3', text: 'Carry out contract administration procedures delegated by the principal agent in terms of the contract', evidence: { kind: 'communications', kinds: ['CONTRACT_INSTRUCTION'], byRole: true }, tickedBy: 'A contract instruction drafted by the architect', go: tab('instructions', 'Instructions') },
    { code: '5.4', text: 'Attend regular site, technical and progress meetings', evidence: { kind: 'meetingsAttended', types: ['SITE'] }, tickedBy: 'Marked present at a site meeting', go: MEET },
    { code: '5.5', text: 'Inspect the works for conformity to contract documentation', evidence: { kind: 'any', of: [{ kind: 'inspections', kinds: ['DESIGN_SUPERVISION', 'QUALITY'], byRole: true }, { kind: 'ncrs' }] }, tickedBy: 'A site inspection completed, or an NCR raised, by the architect', go: tab('inspections', 'Inspections') },
    { code: '5.6', text: 'Clarify details and descriptions during construction as required', evidence: { kind: 'rfisAnswered', byRole: true }, tickedBy: 'An RFI answered', go: tab('technical', 'RFIs') },
    { code: '5.7', text: 'Receive, comment and approve interim payment valuations', evidence: { kind: 'registerReviewed', register: 'payment-certificates' }, tickedBy: 'A payment valuation reviewed and signed by the architect', go: reg('payment-certificates', 'Payment certificates') },
    { code: '5.8', text: 'Witness and review all tests and mock-ups carried out both on and off site', evidence: { kind: 'inspections', kinds: ['TEST_WITNESS', 'MOCK_UP'] }, tickedBy: 'A test or mock-up inspection completed', go: tab('inspections', 'Inspections') },
    { code: '5.9', text: 'Check and approve subcontract shop drawings for design intent', evidence: { kind: 'submittalsReviewed', byRole: true }, tickedBy: 'A shop drawing submittal reviewed', go: tab('technical', 'Submittals') },
    { code: '5.10', text: 'Update and issue the drawings register', evidence: { kind: 'drawingRegister' }, tickedBy: 'Numbered drawings on the register, issued on a transmittal', go: DRAWINGS },
    { code: '5.11', text: 'Issue contract instructions as and when required', evidence: { kind: 'communications', kinds: ['CONTRACT_INSTRUCTION'] }, tickedBy: 'A contract instruction issued', go: tab('instructions', 'Instructions') },
    { code: '5.12', text: 'Review and comment on operations and maintenance manuals, guarantees, certificates and warranties', evidence: { kind: 'registerReviewed', register: 'handover-documents', category: ['O_AND_M_MANUAL', 'WARRANTY', 'GUARANTEE', 'STATUTORY_CERTIFICATE'] }, tickedBy: 'An O&M manual, guarantee, warranty or certificate reviewed by the architect', go: reg('handover-documents', 'Handover documents') },
    { code: '5.13', text: 'Inspect the works and issue practical completion and defects lists', evidence: { kind: 'any', of: [{ kind: 'punchItems' }, { kind: 'inspections', kinds: ['PRACTICAL_COMPLETION'] }, { kind: 'register', register: 'defects', category: ['PRACTICAL_COMPLETION_LIST'] }] }, tickedBy: 'Punch items on the drawings, a practical completion inspection, or the practical completion list', go: tab('inspections', 'Inspections') },
    { code: '5.14', text: 'Assist in obtaining statutory certificates', evidence: { kind: 'any', of: [{ kind: 'consentRounds', events: ['SUBMITTED', 'APPROVED'], category: STATUTORY }, { kind: 'register', register: 'handover-documents', category: ['STATUTORY_CERTIFICATE'] }] }, tickedBy: 'A statutory certificate applied for or received', go: AUTHORITIES },
  ],
  CLOSEOUT: [
    { code: '6.1', text: 'Inspect and verify rectification of defects', evidence: { kind: 'any', of: [{ kind: 'punchItems', closed: true }, { kind: 'inspections', kinds: ['DEFECTS_VERIFICATION'] }, { kind: 'register', register: 'defects', status: ['VERIFIED'] }] }, tickedBy: 'Punch items closed after inspection, a defects verification inspection, or defects verified', go: tab('inspections', 'Inspections') },
    { code: '6.2', text: 'Receive, comment and approve relevant payment valuations and completion certificates', evidence: { kind: 'registerReviewed', register: 'certificates', category: ['WORKS_COMPLETION', 'FINAL_COMPLETION'] }, tickedBy: 'A works or final completion certificate reviewed by the architect', go: reg('certificates', 'Handover and completion') },
    { code: '6.3', text: 'Prepare and/or procure operations and maintenance manuals, guarantees and warranties', evidence: { kind: 'register', register: 'handover-documents', category: ['O_AND_M_MANUAL', 'WARRANTY', 'GUARANTEE'], status: ['RECEIVED', 'DISTRIBUTED'] }, tickedBy: 'O&M manuals, guarantees or warranties received', go: reg('handover-documents', 'Handover documents') },
    { code: '6.4', text: 'Prepare and/or procure as-built drawings and documentation', evidence: { kind: 'any', of: [{ kind: 'drawings', purposes: ['AS_BUILT'] }, { kind: 'register', register: 'handover-documents', category: ['AS_BUILT'], status: ['RECEIVED', 'DISTRIBUTED'] }] }, tickedBy: 'As-built drawings on the register', go: DRAWINGS },
  ],
};

// PROCSA Quantity Surveyor, Stages 2 to 6 (the user, 28 Oct 2026: the QS
// does their work in the platform). Text as in the client's PROCSA
// Responsibility Matrix. Most items tick from the QS's own records: bills
// and estimates issued, variations assessed, valuations, final accounts.
const QS_ROLES: ProjectMemberRole[] = ['QUANTITY_SURVEYOR'];
const BILLS = tab('commercial', 'Bills & cost plans');
const CONTRACTS = tab('commercial', 'Contracts & valuations');
const QS_LIAISE: DeliveryEvidence = { kind: 'any', of: [{ kind: 'transmittalsByRole' }, { kind: 'communications', kinds: ['CORRESPONDENCE'], byRole: true }, { kind: 'costPlans', byRole: true }] };
const VIABILITY: DeliveryEvidence = { kind: 'any', of: [{ kind: 'document', match: /viability|feasibility/i }, { kind: 'register', register: 'finance' }] };
const RECEIVED: DeliveryEvidence = { kind: 'transmittalsReceived' };
const QS_CERTIFIED = ['CERTIFIED', 'APPROVED', 'PAID'];

const QS_ITEMS: Partial<Record<ProjectStage, DeliveryItem[]>> = {
  CONCEPT: [
    { code: '2.1', text: 'Agree the documentation programme with the principal consultant and other consultants', evidence: { kind: 'docProgramme' }, tickedBy: 'Drawings planned on the documentation programme', go: DRAWINGS },
    { code: '2.2', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '2.3', text: 'Review and evaluate design concepts and advise on viability in conjunction with the other consultants', evidence: { kind: 'any', of: [{ kind: 'costPlans', kinds: ['PRELIMINARY', 'ELEMENTAL'], byRole: true }, { kind: 'communications', kinds: ['CORRESPONDENCE'], byRole: true }] }, tickedBy: 'A preliminary or elemental estimate issued, or written advice from the QS', go: BILLS },
    { code: '2.4', text: 'Receive relevant data and cost estimates from the other consultants', evidence: RECEIVED, tickedBy: 'Information sent to the QS on a transmittal', go: tab('documents', 'Transmittals') },
    { code: '2.5', text: 'Prepare preliminary and elemental or equivalent estimates of construction cost', evidence: { kind: 'costPlans', kinds: ['PRELIMINARY', 'ELEMENTAL'], byRole: true }, tickedBy: 'A preliminary or elemental estimate issued', go: BILLS },
    { code: '2.6', text: 'Assist the client in preparing a financial viability report', evidence: VIABILITY, tickedBy: 'A viability report on file, or a finance facility being prepared', go: tab('documents', 'Documents') },
    { code: '2.7', text: 'Audit space allocation against the initial brief', evidence: { kind: 'register', register: 'area-schedule' }, tickedBy: 'Spaces and brief areas on the area schedule', go: reg('area-schedule', 'Area schedule') },
    { code: '2.8', text: 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants', evidence: QS_LIAISE, tickedBy: 'A transmittal, letter or bill from the QS', go: tab('instructions', 'Instructions') },
  ],
  DESIGN: [
    { code: '3.1', text: 'Review the documentation programme with the principal consultant and other consultants', evidence: { kind: 'docProgramme' }, tickedBy: 'Drawings planned on the documentation programme', go: DRAWINGS },
    { code: '3.2', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '3.3', text: 'Review and evaluate design and outline specifications and exercise cost control in conjunction with the other consultants', evidence: { kind: 'costPlans', minRevision: 2, byRole: true }, tickedBy: 'A cost plan re-issued as the design developed', go: BILLS },
    { code: '3.4', text: 'Receive relevant data and cost estimates from the other consultants', evidence: RECEIVED, tickedBy: 'Information sent to the QS on a transmittal', go: tab('documents', 'Transmittals') },
    { code: '3.5', text: 'Prepare detailed estimates of construction cost', evidence: { kind: 'costPlans', kinds: ['DETAILED'], byRole: true }, tickedBy: 'A detailed estimate issued', go: BILLS },
    { code: '3.6', text: 'Assist the client in reviewing the financial viability report', evidence: VIABILITY, tickedBy: 'A viability report on file, or a finance facility being prepared', go: tab('documents', 'Documents') },
    { code: '3.7', text: 'Comment on space and accommodation allowances and prepare an area schedule', evidence: { kind: 'register', register: 'area-schedule' }, tickedBy: 'Spaces on the area schedule', go: reg('area-schedule', 'Area schedule') },
    { code: '3.8', text: 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants', evidence: QS_LIAISE, tickedBy: 'A transmittal, letter or bill from the QS', go: tab('instructions', 'Instructions') },
  ],
  DOCUMENTATION_PROCUREMENT: [
    { code: '4.1', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '4.2', text: 'Assist the principal consultant in the formulation of the procurement strategy for contractors, subcontractors and suppliers', evidence: { kind: 'procurementPolicy' }, tickedBy: 'The procurement policy (delivery strategy) on file', go: tab('inception', 'Procurement policy') },
    { code: '4.3', text: 'Review working drawings for compliance with the approved budget of construction cost and/or financial viability', evidence: { kind: 'costPlans', kinds: ['PRE_TENDER'], byRole: true }, tickedBy: 'A pre-tender estimate issued', go: BILLS },
    { code: '4.4', text: 'Prepare documentation for both principal and subcontract procurement', evidence: { kind: 'costPlans', kinds: ['TENDER_BOQ'], byRole: true }, tickedBy: 'A bill of quantities for tender issued', go: BILLS },
    { code: '4.5', text: 'Assist the principal consultant with calling of tenders and / or negotiation of prices', evidence: { kind: 'tenders', status: ['ISSUED', 'CLOSED', 'AWARDED'] }, tickedBy: 'A tender on the bill of quantities issued', go: tab('procurement', 'Procurement') },
    { code: '4.6', text: 'Assist with financial evaluation of tenders', evidence: { kind: 'tenders', status: ['CLOSED', 'AWARDED'] }, tickedBy: 'Tenders on the bill closed or awarded, with the comparison on the bill', go: BILLS },
    { code: '4.7', text: 'Assist with the preparation of contract documentation for signature', evidence: { kind: 'contracts' }, tickedBy: 'A contract set up with its sum and retention terms', go: CONTRACTS },
  ],
  CONSTRUCTION: [
    { code: '5.1', text: 'Attend the site handover', evidence: { kind: 'register', register: 'certificates', category: ['SITE_HANDOVER'] }, tickedBy: 'The site handover recorded', go: reg('certificates', 'Handover and completion') },
    { code: '5.2', text: 'Prepare schedules of predicted cash flow', evidence: { kind: 'register', register: 'cash-flow' }, tickedBy: 'A cash flow forecast on the register', go: reg('cash-flow', 'Cash flow') },
    { code: '5.3', text: 'Prepare pro-active estimates for proposed variations for client decision-making', evidence: { kind: 'variationsAssessed', byRole: true }, tickedBy: 'A variation assessed by the QS', go: tab('commercial', 'Variations') },
    { code: '5.4', text: 'Attend regular site, technical and progress meetings', evidence: { kind: 'meetingsAttended', types: ['SITE'] }, tickedBy: 'Marked present at a site meeting', go: MEET },
    { code: '5.5', text: 'Adjudicate and resolve financial claims by the contractor(s)', evidence: { kind: 'register', register: 'claims', status: ['RECOMMENDED', 'AGREED', 'REJECTED'] }, tickedBy: 'A claim recommended or settled', go: reg('claims', 'Contractual claims') },
    { code: '5.6', text: 'Assist in the resolution of contractual claims by the contractor(s)', evidence: { kind: 'register', register: 'claims' }, tickedBy: 'Claims on the register', go: reg('claims', 'Contractual claims') },
    { code: '5.7', text: 'Establish and maintain a financial control system', evidence: { kind: 'all', of: [{ kind: 'budgetLocked' }, { kind: 'contracts' }] }, tickedBy: 'The budget locked and contracts set up, so the cost report tracks them', go: tab('commercial', 'Cost report') },
    { code: '5.8', text: 'Prepare valuations for payment certificates to be issued by the principal agent', evidence: { kind: 'valuations', status: ['SUBMITTED', ...QS_CERTIFIED, 'REJECTED'], byRole: true }, tickedBy: 'A valuation submitted by the QS', go: CONTRACTS },
    { code: '5.9', text: 'Prepare final account(s) for the works on a progressive basis', evidence: { kind: 'register', register: 'final-accounts' }, tickedBy: 'A final account in preparation', go: CONTRACTS },
  ],
  CLOSEOUT: [
    { code: '6.1', text: 'Prepare valuations for payment certificates to be issued by the principal agent', evidence: { kind: 'valuations', status: QS_CERTIFIED, final: true, byRole: true }, tickedBy: 'The final valuation certified', go: CONTRACTS },
    { code: '6.2', text: 'Conclude final account(s)', evidence: { kind: 'register', register: 'final-accounts', status: ['AGREED'] }, tickedBy: 'A final account agreed', go: CONTRACTS },
  ],
};

// PROCSA Civil Engineer, Stages 2 to 6 (the user, 29 Oct 2026: the
// engineers one at a time, civil first). Text as in the client's PROCSA
// Responsibility Matrix. Most of it is the architect's kind of work for the
// civil works; the rest ticks from the Stage 1 registers carried on (design
// criteria, investigations, advice), the service connections and the final
// accounts of civil works.
const CIVIL_ROLES: ProjectMemberRole[] = ['CIVIL_ENGINEER', 'ARCHITECT_ENGINEER'];
const ENG_LIAISE: DeliveryEvidence = { kind: 'any', of: [{ kind: 'transmittalsByRole' }, { kind: 'communications', kinds: ['CORRESPONDENCE', 'CONTRACT_INSTRUCTION'], byRole: true }] };
const SUPPORT = tab('inception', 'Supporting registers');
const COMPLETION_CERTS: DeliveryEvidence = { kind: 'registerReviewed', register: 'certificates', category: ['PRACTICAL_COMPLETION', 'WORKS_COMPLETION', 'FINAL_COMPLETION'] };

const CIVIL_ITEMS: Partial<Record<ProjectStage, DeliveryItem[]>> = {
  CONCEPT: [
    { code: '2.1', text: 'Agree documentation programme with principal consultant and other consultants', evidence: { kind: 'docProgramme' }, tickedBy: 'Drawings planned on the documentation programme', go: DRAWINGS },
    { code: '2.2', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '2.3', text: 'Establish concept design criteria', evidence: { kind: 'designCriteria' }, tickedBy: 'A design criterion set by the civil engineer', go: SUPPORT },
    { code: '2.4', text: 'Prepare initial concept design and related documentation', evidence: { kind: 'drawings', purposes: ['FOR_INFORMATION', 'FOR_COMMENT'], byRole: true }, tickedBy: 'Concept drawings on the register', go: DRAWINGS },
    { code: '2.5', text: 'Advise client regarding further surveys, analyses, tests and investigations which may be required', evidence: { kind: 'any', of: [{ kind: 'investigations' }, { kind: 'advice', topics: ['SURVEYS_INVESTIGATIONS'] }] }, tickedBy: 'An investigation recommended, or written advice on surveys', go: SUPPORT },
    { code: '2.6', text: 'Refine and assess concept design to ensure conformance with all regulatory requirements and consents', evidence: { kind: 'any', of: [{ kind: 'advice', topics: ['RIGHTS_CONSTRAINTS_CONSENTS'] }, { kind: 'drawings', purposes: ['FOR_AUTHORITY_SUBMISSION'], byRole: true }] }, tickedBy: 'Advice on consents, or drawings issued for the authority', go: SUPPORT },
    { code: '2.7', text: "Establish regulatory authorities' requirements and incorporate into the design", evidence: { kind: 'consentRounds', events: ['SUBMITTED', 'NOTE', 'COMMENTS_RECEIVED'], byRole: true }, tickedBy: 'A round with an authority recorded by the civil engineer', go: AUTHORITIES },
    { code: '2.8', text: 'Establish access, utilities, services and connections required for the design', evidence: { kind: 'register', register: 'service-agreements', byRole: true }, tickedBy: 'Service connections on the register', go: reg('service-agreements', 'Service connections') },
    { code: '2.9', text: 'Coordinate design interfaces with other consultants', evidence: { kind: 'any', of: [{ kind: 'drawings', purposes: ['FOR_COORDINATION'], byRole: true }, { kind: 'meetingsAttended', types: ['CONSULTANTS'] }] }, tickedBy: 'Drawings issued for co-ordination, or a consultants meeting attended', go: DRAWINGS },
    { code: '2.10', text: 'Prepare preliminary designs and related documentation for approval by authorities and client and suitable for costing', evidence: { kind: 'drawings', purposes: ['FOR_CLIENT_APPROVAL', 'FOR_AUTHORITY_SUBMISSION'], byRole: true }, tickedBy: 'Preliminary designs issued for approval', go: DRAWINGS },
    { code: '2.11', text: 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants', evidence: ENG_LIAISE, tickedBy: 'A transmittal or letter from the civil engineer', go: tab('documents', 'Transmittals') },
  ],
  DESIGN: [
    { code: '3.1', text: 'Review documentation programme with principal consultant and other consultants', evidence: { kind: 'docProgramme' }, tickedBy: 'Drawings planned on the documentation programme', go: DRAWINGS },
    { code: '3.2', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '3.3', text: "Incorporate client's and authorities' detailed requirements into design", evidence: { kind: 'any', of: [{ kind: 'consentRounds', events: ['COMMENTS_RECEIVED'], byRole: true }, { kind: 'clientDocApprovals', approvedOnly: true }] }, tickedBy: "The authority's comments recorded, or a design approved by the client", go: AUTHORITIES },
    { code: '3.4', text: "Incorporate other consultants' designs and requirements into design", evidence: { kind: 'drawings', purposes: ['FOR_COORDINATION'], byRole: true }, tickedBy: 'Drawings issued for co-ordination', go: DRAWINGS },
    { code: '3.5', text: 'Prepare design development drawings including draft technical details and specifications', evidence: { kind: 'drawings', purposes: ['FOR_COMMENT', 'FOR_CLIENT_APPROVAL', 'FOR_COORDINATION'], byRole: true }, tickedBy: 'Design development drawings on the register', go: DRAWINGS },
    { code: '3.6', text: 'Liaise, co-operate and provide necessary information to principal consultant and other consultants', evidence: ENG_LIAISE, tickedBy: 'A transmittal or letter from the civil engineer', go: tab('documents', 'Transmittals') },
    { code: '3.7', text: 'Submit necessary design documentation to local authorities for approval', evidence: { kind: 'any', of: [{ kind: 'consentRounds', events: ['SUBMITTED', 'RESUBMITTED'], byRole: true }, { kind: 'drawings', purposes: ['FOR_AUTHORITY_SUBMISSION'], byRole: true }] }, tickedBy: 'Design documents submitted to the authority', go: AUTHORITIES },
  ],
  DOCUMENTATION_PROCUREMENT: [
    { code: '4.1', text: "Attend design and consultants' meetings", evidence: DESIGN_MEETINGS, tickedBy: 'Marked present at a design or consultants meeting', go: MEET },
    { code: '4.2', text: 'Prepare specifications for scope of works and agree preambles with quantity surveyor', evidence: { kind: 'document', match: /specification|preamble/i }, tickedBy: 'A specification on file', go: tab('documents', 'Documents') },
    { code: '4.3', text: 'Accommodate services design', evidence: { kind: 'drawings', purposes: ['FOR_COORDINATION'], byRole: true }, tickedBy: 'Services co-ordination drawings issued', go: DRAWINGS },
    { code: '4.4', text: 'Check cost estimate with quantity surveyor and adjust documents if necessary to remain within budget', evidence: { kind: 'any', of: [{ kind: 'costPlans', kinds: ['PRE_TENDER'] }, { kind: 'estimateFinal' }, { kind: 'budgetLocked' }] }, tickedBy: "The QS's pre-tender estimate, a final estimate, or the budget locked", go: tab('commercial', 'Commercial') },
    { code: '4.5', text: 'Provide working drawings to quantity surveyor for preparation of procurement documentation', evidence: { kind: 'drawings', purposes: ['FOR_PROCUREMENT'], byRole: true }, tickedBy: 'Drawings issued for procurement', go: DRAWINGS },
    { code: '4.6', text: 'Liaise, co-operate and provide necessary information to principal consultant and other consultants', evidence: ENG_LIAISE, tickedBy: 'A transmittal or letter from the civil engineer', go: tab('documents', 'Transmittals') },
    { code: '4.7', text: 'Assist with evaluation of tenders', evidence: { kind: 'rfqs', status: ['AWARDED'] }, tickedBy: 'A tender evaluated and awarded', go: tab('procurement', 'Procurement') },
    { code: '4.8', text: 'Assist with preparation of contract documentation for signature', evidence: { kind: 'any', of: [{ kind: 'contracts' }, { kind: 'document', match: /contract|agreement/i }] }, tickedBy: 'A contract set up, or contract documentation on file', go: tab('documents', 'Documents') },
    { code: '4.9', text: 'Assess samples and products for compliance and design intent', evidence: { kind: 'any', of: [{ kind: 'submittalsReviewed', byRole: true }, { kind: 'inspections', kinds: ['MOCK_UP'], byRole: true }] }, tickedBy: 'A sample submittal reviewed, or a mock-up inspected', go: tab('technical', 'Submittals') },
  ],
  CONSTRUCTION: [
    { code: '5.1', text: 'Attend site handover', evidence: { kind: 'register', register: 'certificates', category: ['SITE_HANDOVER'] }, tickedBy: 'The site handover recorded', go: reg('certificates', 'Handover and completion') },
    { code: '5.2', text: 'Issue construction documentation in accordance with the documentation schedule', evidence: { kind: 'drawings', purposes: ['FOR_CONSTRUCTION'], byRole: true }, tickedBy: 'Drawings issued for construction', go: DRAWINGS },
    { code: '5.3', text: 'Carry out contract administration', evidence: { kind: 'communications', kinds: ['CONTRACT_INSTRUCTION'], byRole: true }, tickedBy: 'A contract instruction drafted by the civil engineer', go: tab('instructions', 'Instructions') },
    { code: '5.4', text: 'Attend regular site, technical and progress meetings', evidence: { kind: 'meetingsAttended', types: ['SITE'] }, tickedBy: 'Marked present at a site meeting', go: MEET },
    { code: '5.5', text: 'Inspect works for conformity to contract documentation', evidence: { kind: 'any', of: [{ kind: 'inspections', kinds: ['DESIGN_SUPERVISION', 'QUALITY'], byRole: true }, { kind: 'ncrs' }] }, tickedBy: 'A site inspection completed, or an NCR raised, by the civil engineer', go: tab('inspections', 'Inspections') },
    { code: '5.6', text: 'Assist in the resolution of contractual claims by the contractor', evidence: { kind: 'register', register: 'claims' }, tickedBy: 'Claims on the register', go: reg('claims', 'Contractual claims') },
    { code: '5.7', text: 'Clarify details and descriptions during construction as required', evidence: { kind: 'rfisAnswered', byRole: true }, tickedBy: 'An RFI answered', go: tab('technical', 'RFIs') },
    { code: '5.8', text: 'Receive, comment and approve interim payment valuations', evidence: { kind: 'registerReviewed', register: 'payment-certificates' }, tickedBy: 'A valuation reviewed and signed by the civil engineer', go: reg('payment-certificates', 'Payment certificates') },
    { code: '5.9', text: 'Witnessing and review of all tests and mock ups carried out both on and off site', evidence: { kind: 'inspections', kinds: ['TEST_WITNESS', 'MOCK_UP'], byRole: true }, tickedBy: 'A test or mock-up witnessed by the civil engineer', go: tab('inspections', 'Inspections') },
    { code: '5.10', text: 'Check and approve subcontract shop drawings for design intent', evidence: { kind: 'submittalsReviewed', byRole: true }, tickedBy: 'A shop drawing submittal reviewed', go: tab('technical', 'Submittals') },
    { code: '5.11', text: 'Update and issue drawings register', evidence: { kind: 'drawingRegister' }, tickedBy: 'Numbered drawings on the register, issued on a transmittal', go: DRAWINGS },
    { code: '5.12', text: 'Issue contract instructions as and when required', evidence: { kind: 'communications', kinds: ['CONTRACT_INSTRUCTION'], byRole: true }, tickedBy: 'A contract instruction from the civil engineer', go: tab('instructions', 'Instructions') },
    { code: '5.13', text: 'Prepare final account(s) for the works on a progressive basis', evidence: { kind: 'register', register: 'final-accounts', byRole: true }, tickedBy: 'A final account for the civil works in preparation', go: reg('final-accounts', 'Final accounts') },
    { code: '5.14', text: 'Review and comment on operation and maintenance manuals, guarantee certificates and warranties', evidence: { kind: 'registerReviewed', register: 'handover-documents', category: ['O_AND_M_MANUAL', 'WARRANTY', 'GUARANTEE', 'STATUTORY_CERTIFICATE'] }, tickedBy: 'An O&M manual, guarantee or warranty reviewed by the civil engineer', go: reg('handover-documents', 'Handover documents') },
    { code: '5.15', text: 'Inspect the works and issue practical completion and defects lists', evidence: { kind: 'any', of: [{ kind: 'punchItems' }, { kind: 'inspections', kinds: ['PRACTICAL_COMPLETION'], byRole: true }, { kind: 'register', register: 'defects', category: ['PRACTICAL_COMPLETION_LIST'], byRole: true }] }, tickedBy: 'Punch items, a practical completion inspection, or the practical completion list', go: tab('inspections', 'Inspections') },
    { code: '5.16', text: 'Assist in obtaining statutory certificates', evidence: { kind: 'any', of: [{ kind: 'consentRounds', events: ['SUBMITTED', 'APPROVED'], category: STATUTORY }, { kind: 'register', register: 'handover-documents', category: ['STATUTORY_CERTIFICATE'] }] }, tickedBy: 'A statutory certificate applied for or received', go: AUTHORITIES },
  ],
  CLOSEOUT: [
    { code: '6.1', text: 'Inspect and verify rectification of defects', evidence: { kind: 'any', of: [{ kind: 'punchItems', closed: true }, { kind: 'inspections', kinds: ['DEFECTS_VERIFICATION'], byRole: true }, { kind: 'register', register: 'defects', status: ['VERIFIED'], byRole: true }] }, tickedBy: 'Punch items closed, a defects verification inspection, or defects verified', go: tab('inspections', 'Inspections') },
    { code: '6.2', text: 'Receive, comment and approve relevant payment valuations and completion certificates', evidence: { kind: 'any', of: [COMPLETION_CERTS, { kind: 'registerReviewed', register: 'payment-certificates' }] }, tickedBy: 'A completion certificate or valuation reviewed by the civil engineer', go: reg('certificates', 'Handover and completion') },
    { code: '6.3', text: 'Prepare and/or procure operations and maintenance manuals, guarantees and warranties', evidence: { kind: 'register', register: 'handover-documents', category: ['O_AND_M_MANUAL', 'WARRANTY', 'GUARANTEE'], status: ['RECEIVED', 'DISTRIBUTED'], byRole: true }, tickedBy: 'O&M manuals, guarantees or warranties received', go: reg('handover-documents', 'Handover documents') },
    { code: '6.4', text: 'Prepare and/or procure as-built drawings and documentation', evidence: { kind: 'any', of: [{ kind: 'drawings', purposes: ['AS_BUILT'], byRole: true }, { kind: 'register', register: 'handover-documents', category: ['AS_BUILT'], status: ['RECEIVED', 'DISTRIBUTED'], byRole: true }] }, tickedBy: 'As-built drawings on the register', go: DRAWINGS },
    { code: '6.5', text: 'Conclude final account(s)', evidence: { kind: 'register', register: 'final-accounts', status: ['AGREED'], byRole: true }, tickedBy: 'A final account for the civil works agreed', go: reg('final-accounts', 'Final accounts') },
  ],
};

// PROCSA Structural Engineer, Stages 2 to 6 (the user, 2 Nov 2026: the
// engineers one at a time, structural second). The same work as the civil
// engineer's, evidenced the same way from the structural engineer's own
// records, but without the final account: Stage 5 runs to 5.15 and Stage 6
// to 6.4. Text as in the client's PROCSA Responsibility Matrix.
const STRUCTURAL_ROLES: ProjectMemberRole[] = ['STRUCTURAL_ENGINEER', 'ARCHITECT_ENGINEER'];
const STRUCTURAL_TEXT: Record<string, string> = {
  '2.1': 'Agree the documentation programme with the principal consultant and the other consultants',
  '2.2': "Attend design and consultants' meetings",
  '2.3': 'Establish concept design criteria',
  '2.4': 'Prepare initial concept design and related documentation',
  '2.5': 'Advise the client regarding further surveys, analyses, tests and investigations which may be required',
  '2.6': 'Refine and assess concept design to ensure conformance with all regulatory requirements and consents',
  '2.7': "Establish regulatory authorities' requirements and incorporate into the design",
  '2.8': 'Establish access, utilities, services and connections required for the design',
  '2.9': 'Co-ordinate design interfaces with other consultants',
  '2.10': 'Prepare preliminary designs and related documentation for approval by authorities and the client and suitable for estimates of construction cost',
  '2.11': 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants',
  '3.1': 'Review the documentation programme with the principal consultant and the other consultants',
  '3.2': "Attend design and consultants' meetings",
  '3.3': "Incorporate the client's and authorities' detailed requirements into the design",
  '3.4': "Incorporate the other consultants' designs and requirements into the design",
  '3.5': 'Prepare design development drawings including draft technical details and specifications',
  '3.6': 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants',
  '3.7': 'Submit necessary design documentation to local authorities for approval',
  '4.1': "Attend design and consultants' meetings",
  '4.2': 'Prepare specifications for the works and agree preambles with the quantity surveyor',
  '4.3': 'Accommodate services design',
  '4.4': 'Check cost estimate with the quantity surveyor and adjust documents if necessary to remain within budget',
  '4.5': 'Provide working drawings to the quantity surveyor for preparation of procurement documentation',
  '4.6': 'Liaise, co-operate and provide necessary information to the principal consultant and the other consultants',
  '4.7': 'Assist with evaluation of tenders',
  '4.8': 'Assist with preparation of contract documentation for signature',
  '4.9': 'Assess samples and products for compliance and design intent',
  '5.1': 'Attend the site handover',
  '5.2': 'Issue construction documentation in accordance with the documentation programme',
  '5.3': 'Carry out contract administration procedures delegated by the principal agent in terms of the contract',
  '5.4': 'Attend regular site, technical and progress meetings',
  '5.5': 'Inspect the works for conformity to contract documentation',
  '5.6': 'Assist in the resolution of contractual claims by the contractor',
  '5.7': 'Clarify details and descriptions during construction as required',
  '5.8': 'Receive, comment and approve interim payment valuations',
  '5.9': 'Witness and review of all tests and mock-ups carried out both on and off the site',
  '5.10': 'Check and approve subcontract shop drawings for design intent',
  '5.11': 'Update and issue drawings register',
  '5.12': 'Issue contract instructions as and when required',
  '5.13': 'Review and comment on operation and maintenance manuals, guarantees, certificates and warranties',
  '5.14': 'Inspect the works and issue practical completion and defects lists',
  '5.15': 'Assist in obtaining statutory certificates',
  '6.1': 'Inspect and verify rectification of defects',
  '6.2': 'Receive, comment and approve relevant payment valuations and completion certificates',
  '6.3': 'Prepare and/or procure operations and maintenance manuals, guarantees and warranties',
  '6.4': 'Prepare and/or procure as-built drawings and documentation',
};
// The civil engineer's codes the structural engineer has no equivalent of
// (the final account of the works), and where the later items move to.
const CIVIL_ONLY = new Set(['5.13', '6.5']);
const RENUMBER: Record<string, string> = { '5.14': '5.13', '5.15': '5.14', '5.16': '5.15' };
const STRUCTURAL_ITEMS: Partial<Record<ProjectStage, DeliveryItem[]>> = Object.fromEntries(
  Object.entries(CIVIL_ITEMS).map(([stage, items]) => [
    stage,
    (items ?? [])
      .filter((i) => !CIVIL_ONLY.has(i.code))
      .map((i) => {
        const code = RENUMBER[i.code] ?? i.code;
        return { ...i, code, text: STRUCTURAL_TEXT[code], tickedBy: i.tickedBy.replace(/civil engineer/g, 'structural engineer') };
      }),
  ]),
);

// PROCSA Electrical and Mechanical Engineers, Stages 2 to 6 (the user,
// 2 Nov 2026: carry on with the engineers). Their matrices are the same
// item for item: the civil engineer's work, plus cost estimates and life
// cycle costs (2.11, so liaison moves to 2.12), their own cost estimate to
// the QS (4.4), and commissioning with the tests (5.9). Like the civil
// engineer they keep a final account of their works (5.13, 6.5).
const COST_ESTIMATE = /estimate|life[\s-]*cycle|cost/i;
const SERVICES_TEXT: Record<string, string> = {
  '2.1': 'Agree documentation programme with principal consultant and other consultants',
  '2.2': "Attend design and consultants' meetings",
  '2.3': 'Establish concept design criteria',
  '2.4': 'Prepare initial concept design and related documentation',
  '2.5': 'Advise client regarding further surveys, analyses, tests and investigations which may be required',
  '2.6': 'Refine and assess the concept design to ensure conformance with all regulatory requirements and consents',
  '2.7': "Establish regulatory authorities' requirements and incorporate into the design",
  '2.8': 'Establish utilities, services and connections required for the design',
  '2.9': 'Coordinate design interfaces with other consultants',
  '2.10': 'Prepare preliminary design and related documentation for approval by authorities and client and suitable for costing',
  '2.11': 'Provide cost estimates and life cycle costs as required',
  '2.12': 'Liaise, co-operate and provide necessary information to the client, principal consultant and other consultants',
  '3.1': 'Review documentation programme with principal consultant and other consultants',
  '3.2': "Attend design and consultants' meetings",
  '3.3': "Incorporate client's and authorities' detailed requirements into design",
  '3.4': "Incorporate other consultants' designs and requirements into design",
  '3.5': 'Prepare design development drawings including draft technical details and specifications',
  '3.6': 'Liaise, co-operate and provide necessary information to principal consultant and other consultants',
  '3.7': 'Submit necessary design documentation to local authorities for approval',
  '4.1': "Attend design and consultants' meetings",
  '4.2': 'Prepare specifications for scope of works and agree preambles with quantity surveyor',
  '4.3': 'Co-ordinate services design with other consultants',
  '4.4': 'Provide cost estimate to quantity surveyor for incorporation into the construction budget',
  '4.5': 'Provide working drawings to the quantity surveyor for preparation of procurement documentation',
  '4.6': 'Liaise, co-operate and provide necessary information to principal consultant and other consultants',
  '4.7': 'Assist with evaluation of tenders',
  '4.8': 'Assist with preparation of contract documentation for signature',
  '4.9': 'Assess samples and products for compliance and design intent',
  '5.1': 'Attend site handover',
  '5.2': 'Issue construction documentation in accordance with the documentation schedule',
  '5.3': 'Carry out contract administration procedures delegated by the principal agent',
  '5.4': 'Attend regular site, progress and technical meetings',
  '5.5': 'Inspect works for conformity to contract documentation',
  '5.6': 'Assist in the resolution of contractual claims by the contractor',
  '5.7': 'Clarify details and descriptions during construction as required',
  '5.8': 'Receive, comment and approve interim payment valuations',
  '5.9': 'Witnessing and review of mock-ups, tests and commissioning',
  '5.10': 'Check and approve subcontract shop drawings for design intent',
  '5.11': 'Update and issue drawings register',
  '5.12': 'Issue contract instructions as and when required',
  '5.13': 'Prepare final account(s) for the works on a progressive basis',
  '5.14': 'Review and comment on operation and maintenance manuals, guarantee certificates and warranties',
  '5.15': 'Inspect the works and issue practical completion and defects lists',
  '5.16': 'Assist in obtaining statutory certificates',
  '6.1': 'Inspect and verify the rectification of defects',
  '6.2': 'Receive, comment and approve relevant payment valuations and completion certificates',
  '6.3': 'Prepare and/or procure operations and maintenance manuals, guarantees and warranties',
  '6.4': 'Prepare and/or procure as-built drawings and documentation',
  '6.5': 'Conclude final account(s)',
};

/** A services engineer's list, from the civil engineer's items. */
function servicesEngineerItems(who: string, text: Record<string, string>): Partial<Record<ProjectStage, DeliveryItem[]>> {
  const out: Partial<Record<ProjectStage, DeliveryItem[]>> = {};
  for (const [stage, items] of Object.entries(CIVIL_ITEMS) as [ProjectStage, DeliveryItem[]][]) {
    const list: DeliveryItem[] = [];
    for (const i of items) {
      const item = { ...i, tickedBy: i.tickedBy.replace(/civil engineer/g, who) };
      if (stage === 'CONCEPT' && i.code === '2.11') {
        list.push({ code: '2.11', text: '', evidence: { kind: 'document', match: COST_ESTIMATE, byRole: true }, tickedBy: `A cost estimate or life cycle costing uploaded by the ${who}`, go: tab('documents', 'Documents') });
        item.code = '2.12';
      }
      if (stage === 'DOCUMENTATION_PROCUREMENT' && i.code === '4.4') {
        item.evidence = { kind: 'document', match: COST_ESTIMATE, byRole: true };
        item.tickedBy = `A cost estimate uploaded by the ${who} for the QS`;
        item.go = tab('documents', 'Documents');
      }
      if (stage === 'CONSTRUCTION' && i.code === '5.9') {
        item.evidence = { kind: 'any', of: [{ kind: 'inspections', kinds: ['TEST_WITNESS', 'MOCK_UP'], byRole: true }, { kind: 'document', match: /commission/i, byRole: true }] };
        item.tickedBy = `A test or mock-up witnessed, or a commissioning record uploaded, by the ${who}`;
      }
      list.push(item);
    }
    out[stage] = list.map((i) => ({ ...i, text: text[i.code] }));
  }
  return out;
}
const ELECTRICAL_ROLES: ProjectMemberRole[] = ['ELECTRICAL_ENGINEER', 'ARCHITECT_ENGINEER'];
const ELECTRICAL_ITEMS = servicesEngineerItems('electrical engineer', SERVICES_TEXT);
const MECHANICAL_ROLES: ProjectMemberRole[] = ['MECHANICAL_ENGINEER', 'ARCHITECT_ENGINEER'];
const MECHANICAL_ITEMS = servicesEngineerItems('mechanical engineer', { ...SERVICES_TEXT, '5.9': 'Witnessing and review of all mock-ups, tests and commissioning' });

for (const s of DELIVERY_STAGES) {
  const items = ARCHITECT_ITEMS[s.stage];
  if (items) s.roles.push({ key: 'ARCHITECT', label: 'Architect', memberRoles: ARCH_ROLES, items });
  const qs = QS_ITEMS[s.stage];
  if (qs) s.roles.push({ key: 'QUANTITY_SURVEYOR', label: 'Quantity Surveyor', memberRoles: QS_ROLES, items: qs });
  const civil = CIVIL_ITEMS[s.stage];
  if (civil) s.roles.push({ key: 'CIVIL_ENGINEER', label: 'Civil Engineer', memberRoles: CIVIL_ROLES, items: civil });
  const structural = STRUCTURAL_ITEMS[s.stage];
  if (structural) s.roles.push({ key: 'STRUCTURAL_ENGINEER', label: 'Structural Engineer', memberRoles: STRUCTURAL_ROLES, items: structural });
  const electrical = ELECTRICAL_ITEMS[s.stage];
  if (electrical) s.roles.push({ key: 'ELECTRICAL_ENGINEER', label: 'Electrical Engineer', memberRoles: ELECTRICAL_ROLES, items: electrical });
  const mechanical = MECHANICAL_ITEMS[s.stage];
  if (mechanical) s.roles.push({ key: 'MECHANICAL_ENGINEER', label: 'Mechanical Engineer', memberRoles: MECHANICAL_ROLES, items: mechanical });
}

export function findDeliveryItem(stage: string, roleKey: string, code: string) {
  return DELIVERY_STAGES.find((s) => s.stage === stage)
    ?.roles.find((r) => r.key === roleKey)
    ?.items.find((i) => i.code === code);
}
