import type { ProjectMemberRole } from '../generated/prisma/enums.js';
import { DESIGN_CONSULTANTS, ENGINEERS } from '../common/consultants.js';

/** The delivery registers PROCSA Stages 2 to 6 need that the other modules
 * don't already cover. Each declares its fields (stored in the shared
 * ProjectRegisterEntry columns), their labels and its statuses. The same
 * definition drives validation here and the screens in the browser
 * (GET /delivery/registers), so there's one place to change a register. */

export type Column =
  | 'title'
  | 'category'
  | 'status'
  | 'reference'
  | 'location'
  | 'partyName'
  | 'contractorId'
  | 'responsibleId'
  | 'documentId'
  | 'amount'
  | 'amount2'
  | 'currency'
  | 'days'
  | 'date'
  | 'dueDate'
  | 'completedAt'
  | 'notes';

export type FieldType = 'text' | 'longtext' | 'money' | 'int' | 'decimal' | 'date' | 'enum' | 'contractor' | 'member' | 'document';

export interface RegisterField {
  column: Column;
  label: string;
  type: FieldType;
  required?: boolean;
  /** enum fields: value -> label */
  options?: Record<string, string>;
  /** Shown in the list as well as the form. */
  inList?: boolean;
  hint?: string;
  /** decimal fields, e.g. m². */
  unit?: string;
}

/** A consultant's signed review of an entry (the user, 26 Oct 2026: finish
 * the architect's role). The reviewer signs with the e-signature of §2.18;
 * a linked certificate PDF is stamped. */
export interface RegisterReview {
  roles: ProjectMemberRole[];
  /** e.g. "Architect's recommendation". */
  label: string;
  procsa: string;
  /** Only these categories are reviewed (e.g. completion certificates, not
   * the site handover). */
  categories?: string[];
}

export interface DeliveryRegister {
  key: string;
  label: string;
  /** Which PROCSA responsibilities it serves, shown under the title. */
  procsa: string;
  description: string;
  /** Contractors can see it (defects, certificates, handover documents). */
  contractorsSee?: boolean;
  /** Outside roles that add and edit entries (Setjeka always can; only
   * Setjeka deletes). */
  editableBy?: ProjectMemberRole[];
  review?: RegisterReview;
  /** Columns summed under the list. */
  totals?: Column[];
  fields: RegisterField[];
}

const ARCHITECT: ProjectMemberRole[] = ['ARCHITECT', 'ARCHITECT_ENGINEER'];
// The QS keeps the money registers with Setjeka (2026-10-28).
const QS: ProjectMemberRole[] = ['QUANTITY_SURVEYOR'];
// The engineers review and keep the same registers as the architect, each
// for their own works (2026-10-29); the civil engineer also keeps the
// service connections and the final accounts of civil works.
const CONSULTANTS = DESIGN_CONSULTANTS;
const CIVIL: ProjectMemberRole[] = ['CIVIL_ENGINEER'];

const opt = (...pairs: [string, string][]) => Object.fromEntries(pairs);

export const DELIVERY_REGISTERS: DeliveryRegister[] = [
  {
    key: 'procedures',
    label: 'Project procedures',
    procsa: 'DM 2.2, 3.2, 3.11, 4.4, 4.10, 5.3 · PM 2.4, 3.1, 4.6, 5.2, 5.10, 5.13',
    description: 'The agreed ways of working: reporting and communication, cost control, document issue, quality assurance, variation control, tender conditions and facilities management.',
    fields: [
      {
        column: 'category',
        label: 'Procedure',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(
          ['REPORTING_AND_COMMUNICATION', 'Reports, presentations and communication'],
          ['DESIGN_COMMUNICATION', 'Design development communication'],
          ['COST_CONTROL', 'Cost control and reporting'],
          ['TENDER_CONDITIONS', 'Project-specific tender conditions'],
          ['CONSTRUCTION_COMMUNICATION', 'Construction communication'],
          ['DOCUMENT_ISSUE', 'Construction document issue'],
          ['QUALITY_ASSURANCE', 'Quality assurance'],
          ['VARIATION_CONTROL', 'Scope and cost variation control'],
          ['FACILITIES_MANAGEMENT', 'Facilities management policy'],
          ['OTHER', 'Other'],
        ),
      },
      { column: 'title', label: 'Summary', type: 'text', required: true, inList: true },
      { column: 'status', label: 'Status', type: 'enum', required: true, inList: true, options: opt(['DRAFT', 'Draft'], ['AGREED', 'Agreed']) },
      { column: 'date', label: 'Agreed on', type: 'date', inList: true },
      { column: 'documentId', label: 'Procedure document', type: 'document' },
      { column: 'notes', label: 'Details', type: 'longtext' },
    ],
  },
  {
    key: 'finance',
    label: 'Project finance',
    procsa: 'DM 2.4, 2.5, 3.15',
    description: 'The bankable business plan and each finance facility, from application to the preconditions being met and drawdown.',
    fields: [
      { column: 'title', label: 'Facility', type: 'text', required: true, inList: true, hint: 'e.g. Senior construction loan' },
      { column: 'partyName', label: 'Lender', type: 'text', inList: true },
      { column: 'amount', label: 'Amount', type: 'money', inList: true },
      {
        column: 'status',
        label: 'Status',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(
          ['BUSINESS_PLAN', 'Business plan in preparation'],
          ['APPLIED', 'Applied'],
          ['APPROVED_IN_PRINCIPLE', 'Approved in principle'],
          ['CONDITIONS_OUTSTANDING', 'Preconditions outstanding'],
          ['CONDITIONS_MET', 'Preconditions met'],
          ['DRAWN', 'Drawn'],
          ['DECLINED', 'Declined'],
        ),
      },
      { column: 'dueDate', label: 'Preconditions due', type: 'date' },
      { column: 'completedAt', label: 'Preconditions met on', type: 'date' },
      { column: 'documentId', label: 'Bankable business plan', type: 'document' },
      { column: 'notes', label: 'Preconditions and notes', type: 'longtext' },
    ],
  },
  {
    key: 'cash-flow',
    label: 'Cash flow',
    procsa: 'DM 3.9 · QS 5.2',
    description: 'Monthly cash flow: what the project needs, against what was spent. The QS spreads each contract over its months from Contracts & valuations, and paid certificates fill in the actuals.',
    editableBy: QS,
    fields: [
      { column: 'date', label: 'Month', type: 'date', required: true, inList: true },
      { column: 'amount', label: 'Forecast', type: 'money', required: true, inList: true },
      { column: 'amount2', label: 'Actual', type: 'money', inList: true },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
  {
    key: 'sales-leasing',
    label: 'Sales and leasing',
    procsa: 'DM 3.12, 3.14, 4.11',
    description: 'Units or space for sale or to let, against the business plan income.',
    fields: [
      { column: 'title', label: 'Unit / space', type: 'text', required: true, inList: true },
      { column: 'category', label: 'Type', type: 'enum', required: true, inList: true, options: opt(['SALE', 'Sale'], ['LEASE', 'Lease']) },
      { column: 'partyName', label: 'Buyer / tenant', type: 'text', inList: true },
      { column: 'amount', label: 'Price / monthly rent', type: 'money', inList: true },
      {
        column: 'status',
        label: 'Status',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(['AVAILABLE', 'Available'], ['RESERVED', 'Reserved'], ['SIGNED', 'Signed'], ['CANCELLED', 'Cancelled']),
      },
      { column: 'date', label: 'Signed on', type: 'date' },
      { column: 'documentId', label: 'Agreement', type: 'document' },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
  {
    key: 'service-agreements',
    label: 'Authority service agreements',
    procsa: 'DM 4.13 · Engineers 2.8',
    description: 'Access, utilities and service connections agreed with the authorities, and the deposits paid. The engineers establish what their designs need.',
    editableBy: ENGINEERS,
    fields: [
      { column: 'title', label: 'Service', type: 'text', required: true, inList: true, hint: 'e.g. Bulk water connection' },
      { column: 'partyName', label: 'Authority', type: 'text', inList: true },
      { column: 'reference', label: 'Reference', type: 'text' },
      { column: 'amount', label: 'Deposit', type: 'money', inList: true },
      {
        column: 'status',
        label: 'Status',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(['TO_APPLY', 'To apply'], ['APPLIED', 'Applied'], ['AGREED', 'Agreed'], ['DEPOSIT_PAID', 'Agreed, deposit paid']),
      },
      { column: 'date', label: 'Agreed on', type: 'date' },
      { column: 'documentId', label: 'Agreement', type: 'document' },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
  {
    key: 'insurances',
    label: 'Insurances',
    procsa: 'DM 4.8, 5.1 · PM 4.3',
    description: 'The project, contractor and development risk insurances, and any claims on them.',
    fields: [
      { column: 'title', label: 'Insurance', type: 'text', required: true, inList: true, hint: "e.g. Contractor's all risks" },
      { column: 'partyName', label: 'Insurer', type: 'text', inList: true },
      { column: 'reference', label: 'Policy number', type: 'text' },
      { column: 'amount', label: 'Cover', type: 'money', inList: true },
      { column: 'date', label: 'Cover starts', type: 'date' },
      { column: 'dueDate', label: 'Cover ends', type: 'date', inList: true },
      {
        column: 'status',
        label: 'Status',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(['PROPOSED', 'Proposed'], ['IN_FORCE', 'In force'], ['CLAIM_OPEN', 'Claim open'], ['EXPIRED', 'Expired']),
      },
      { column: 'documentId', label: 'Policy document', type: 'document' },
      { column: 'notes', label: 'Claims and notes', type: 'longtext' },
    ],
  },
  {
    key: 'payment-certificates',
    label: 'Payment certificates',
    procsa: 'DM 5.9 · PM 5.14, 6.5 · QS 5.8, 6.1',
    description: "Interim and final payment certificates: the QS's valuation, the amount certified and payment. Valuations made under Commercial, Contracts & valuations come here by themselves.",
    contractorsSee: true,
    // Each valuation is reviewed by the consultant named on its contract.
    review: { roles: CONSULTANTS, label: "Consultant's review", procsa: 'Architect 5.7, 6.2 · Civil 5.8, 6.2' },
    fields: [
      { column: 'reference', label: 'Certificate no.', type: 'text', required: true, inList: true },
      { column: 'contractorId', label: 'Contractor', type: 'contractor', inList: true },
      { column: 'date', label: 'Valuation date', type: 'date', inList: true },
      { column: 'amount2', label: 'Gross valuation', type: 'money' },
      { column: 'amount', label: 'Amount certified', type: 'money', required: true, inList: true },
      {
        column: 'status',
        label: 'Status',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(['DRAFT', 'Draft valuation'], ['RECOMMENDED', 'Recommended'], ['ISSUED', 'Issued'], ['PAID', 'Paid']),
      },
      { column: 'documentId', label: 'Certificate', type: 'document' },
      { column: 'notes', label: 'Retention and notes', type: 'longtext' },
    ],
  },
  {
    key: 'claims',
    label: 'Contractual claims',
    procsa: 'DM 5.10 · PM 5.8, 5.15 · QS 5.5, 5.6',
    description: "Contractors' claims for time and money, the QS's assessment, the principal agent's recommendation and the settlement. An agreed claim goes into that contractor's final account.",
    contractorsSee: true,
    editableBy: QS,
    fields: [
      { column: 'reference', label: 'Claim no.', type: 'text', inList: true },
      { column: 'title', label: 'Claim', type: 'text', required: true, inList: true },
      { column: 'contractorId', label: 'Contractor', type: 'contractor', inList: true },
      { column: 'date', label: 'Received', type: 'date' },
      { column: 'amount', label: 'Amount claimed', type: 'money', inList: true },
      { column: 'days', label: 'Time claimed (days)', type: 'int' },
      { column: 'amount2', label: 'Amount agreed', type: 'money' },
      {
        column: 'status',
        label: 'Status',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(['RECEIVED', 'Received'], ['UNDER_REVIEW', 'Under review'], ['RECOMMENDED', 'Recommended'], ['AGREED', 'Agreed'], ['REJECTED', 'Rejected'], ['WITHDRAWN', 'Withdrawn']),
      },
      { column: 'completedAt', label: 'Settled on', type: 'date' },
      { column: 'notes', label: 'Recommendation and notes', type: 'longtext' },
    ],
  },
  {
    key: 'certificates',
    label: 'Handover and completion',
    procsa: 'DM 5.2, 6.1 · PM 5.1, 5.18, 6.6',
    description: 'Site handover to the contractor, practical completion, works completion, final completion and occupation.',
    contractorsSee: true,
    review: { roles: CONSULTANTS, label: "Consultant's review", procsa: 'Architect 6.2 · Civil 6.2', categories: ['PRACTICAL_COMPLETION', 'WORKS_COMPLETION', 'FINAL_COMPLETION', 'OCCUPATION'] },
    fields: [
      {
        column: 'category',
        label: 'Certificate',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(
          ['SITE_HANDOVER', 'Site handover'],
          ['PRACTICAL_COMPLETION', 'Practical completion'],
          ['WORKS_COMPLETION', 'Works completion'],
          ['FINAL_COMPLETION', 'Final completion'],
          ['OCCUPATION', 'Occupation'],
          ['OTHER', 'Other'],
        ),
      },
      { column: 'contractorId', label: 'Contractor', type: 'contractor', inList: true },
      { column: 'reference', label: 'Reference', type: 'text' },
      { column: 'date', label: 'Date', type: 'date', inList: true },
      { column: 'status', label: 'Status', type: 'enum', required: true, inList: true, options: opt(['DRAFT', 'Draft'], ['ISSUED', 'Issued'], ['ACCEPTED', 'Accepted by the client']) },
      { column: 'documentId', label: 'Certificate', type: 'document' },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
  {
    key: 'defects',
    label: 'Defects',
    procsa: 'DM 6.6, 6.8 · PM 5.18, 6.1',
    description: 'Practical completion lists, defects in the defects liability period, and latent defects reported by end users. The architect and the engineers issue the lists for their works and verify each defect is put right.',
    contractorsSee: true,
    editableBy: CONSULTANTS,
    fields: [
      { column: 'title', label: 'Defect', type: 'text', required: true, inList: true },
      {
        column: 'category',
        label: 'List',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(['PRACTICAL_COMPLETION_LIST', 'Practical completion list'], ['DEFECTS_LIABILITY', 'Defects liability period'], ['LATENT', 'Latent (end users)']),
      },
      { column: 'location', label: 'Where', type: 'text', inList: true },
      { column: 'contractorId', label: 'Contractor', type: 'contractor' },
      { column: 'dueDate', label: 'Rectify by', type: 'date', inList: true },
      { column: 'status', label: 'Status', type: 'enum', required: true, inList: true, options: opt(['OPEN', 'Open'], ['RECTIFIED', 'Rectified'], ['VERIFIED', 'Verified']) },
      { column: 'completedAt', label: 'Verified on', type: 'date' },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
  {
    key: 'handover-documents',
    label: 'Handover documents',
    procsa: 'DM 6.2-6.5 · PM 6.2-6.4',
    description: 'As-built drawings, operations and maintenance manuals, warranties, guarantees, statutory certificates and the health and safety file: received, reviewed by the architect and passed on.',
    contractorsSee: true,
    editableBy: CONSULTANTS,
    review: { roles: CONSULTANTS, label: "Consultant's review", procsa: 'Architect 5.12, 6.3, 6.4 · Civil 5.14, 6.3, 6.4' },
    fields: [
      {
        column: 'category',
        label: 'Type',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(
          ['AS_BUILT', 'As-built drawings'],
          ['O_AND_M_MANUAL', 'Operations and maintenance manual'],
          ['WARRANTY', 'Warranty'],
          ['GUARANTEE', 'Guarantee'],
          ['STATUTORY_CERTIFICATE', 'Statutory compliance certificate'],
          ['HEALTH_AND_SAFETY_FILE', 'Health and safety file'],
          ['OTHER', 'Other'],
        ),
      },
      { column: 'title', label: 'Document', type: 'text', required: true, inList: true },
      { column: 'partyName', label: 'From', type: 'text', inList: true },
      { column: 'date', label: 'Received', type: 'date' },
      { column: 'status', label: 'Status', type: 'enum', required: true, inList: true, options: opt(['OUTSTANDING', 'Outstanding'], ['RECEIVED', 'Received'], ['DISTRIBUTED', 'Distributed']) },
      { column: 'completedAt', label: 'Distributed on', type: 'date' },
      { column: 'documentId', label: 'File', type: 'document' },
      { column: 'notes', label: 'Distributed to', type: 'longtext' },
    ],
  },
  {
    key: 'final-accounts',
    label: 'Final accounts',
    procsa: 'DM 6.7 · PM 6.7 · QS 5.9, 6.2 · Civil 5.13, 6.5',
    description: "Each contractor's final account, from preparation to agreement. The QS prepares it from the contract under Commercial, Contracts & valuations, which keeps this register up to date.",
    contractorsSee: true,
    editableBy: [...QS, ...CIVIL],
    fields: [
      { column: 'contractorId', label: 'Contractor', type: 'contractor', inList: true },
      { column: 'title', label: 'Contract', type: 'text', required: true, inList: true },
      { column: 'amount', label: 'Contract sum', type: 'money', inList: true },
      { column: 'amount2', label: 'Final account', type: 'money', inList: true },
      { column: 'status', label: 'Status', type: 'enum', required: true, inList: true, options: opt(['IN_PREPARATION', 'In preparation'], ['SUBMITTED', 'Submitted'], ['AGREED', 'Agreed']) },
      { column: 'completedAt', label: 'Agreed on', type: 'date' },
      { column: 'documentId', label: 'Final account', type: 'document' },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
  {
    key: 'finishes',
    label: 'Finishes schedule',
    procsa: 'Architect 2.8, 4.2, 4.9',
    description: 'Materials and finishes room by room, with the specification clause and whether the sample has been approved for design intent.',
    contractorsSee: true,
    editableBy: ARCHITECT,
    fields: [
      { column: 'location', label: 'Room or area', type: 'text', required: true, inList: true },
      {
        column: 'category',
        label: 'Element',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(
          ['FLOOR', 'Floor'],
          ['WALL', 'Walls'],
          ['CEILING', 'Ceiling'],
          ['SKIRTING', 'Skirting'],
          ['DOOR', 'Doors'],
          ['WINDOW', 'Windows'],
          ['IRONMONGERY', 'Ironmongery'],
          ['SANITARYWARE', 'Sanitaryware'],
          ['JOINERY', 'Joinery'],
          ['EXTERNAL', 'External'],
          ['OTHER', 'Other'],
        ),
      },
      { column: 'title', label: 'Finish or product', type: 'text', required: true, inList: true, hint: 'e.g. 600x600 porcelain tile, matt grey' },
      { column: 'partyName', label: 'Supplier or manufacturer', type: 'text', inList: true },
      { column: 'reference', label: 'Specification clause', type: 'text' },
      {
        column: 'status',
        label: 'Sample',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(['NOT_REQUIRED', 'Not required'], ['TO_SUBMIT', 'To be submitted'], ['SUBMITTED', 'Submitted'], ['APPROVED', 'Approved'], ['REJECTED', 'Rejected']),
      },
      { column: 'date', label: 'Sample decided on', type: 'date' },
      { column: 'documentId', label: 'Data sheet or sample record', type: 'document' },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
  {
    key: 'area-schedule',
    label: 'Area schedule',
    procsa: 'Architect 2.6 · QS 2.7, 3.7',
    description: 'Every space with its designed area against the brief, by use and level, so the space norms and the accommodation can be checked as the design develops.',
    editableBy: [...ARCHITECT, 'QUANTITY_SURVEYOR'],
    totals: ['amount', 'amount2', 'days'],
    fields: [
      { column: 'title', label: 'Space', type: 'text', required: true, inList: true, hint: 'e.g. 2-bed unit type B' },
      {
        column: 'category',
        label: 'Use',
        type: 'enum',
        required: true,
        inList: true,
        options: opt(
          ['RESIDENTIAL', 'Residential'],
          ['RETAIL', 'Retail'],
          ['OFFICE', 'Office'],
          ['HOSPITALITY', 'Hospitality'],
          ['AMENITY', 'Amenity'],
          ['PARKING', 'Parking'],
          ['CIRCULATION', 'Circulation'],
          ['SERVICES', 'Services and plant'],
          ['EXTERNAL', 'External'],
          ['OTHER', 'Other'],
        ),
      },
      { column: 'location', label: 'Level or block', type: 'text', inList: true },
      { column: 'days', label: 'Units', type: 'int', inList: true },
      { column: 'amount', label: 'Designed area', type: 'decimal', unit: 'm²', required: true, inList: true },
      { column: 'amount2', label: 'Brief area', type: 'decimal', unit: 'm²', inList: true },
      { column: 'status', label: 'Measured at', type: 'enum', inList: true, options: opt(['CONCEPT', 'Concept'], ['DESIGN_DEVELOPMENT', 'Design development'], ['CONSTRUCTION_ISSUE', 'Construction issue']) },
      { column: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
];

export const REGISTER_BY_KEY = new Map(DELIVERY_REGISTERS.map((r) => [r.key, r]));
