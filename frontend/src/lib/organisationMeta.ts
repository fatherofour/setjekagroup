export type OrganisationClassification =
  | 'CONTRACTOR'
  | 'CONSULTANT'
  | 'SUPPLIER'
  | 'SUBCONTRACTOR'
  | 'SERVICE_PROVIDER'
  | 'MANUFACTURER'
  | 'SPECIALIST_CONTRACTOR'
  | 'OTHER';

export const CLASSIFICATION_LABEL: Record<OrganisationClassification, string> = {
  CONTRACTOR: 'Contractor',
  CONSULTANT: 'Consultant',
  SUPPLIER: 'Supplier',
  SUBCONTRACTOR: 'Subcontractor',
  SERVICE_PROVIDER: 'Service Provider',
  MANUFACTURER: 'Manufacturer',
  SPECIALIST_CONTRACTOR: 'Specialist Contractor',
  OTHER: 'Other',
};

export const CLASSIFICATIONS = Object.keys(CLASSIFICATION_LABEL) as OrganisationClassification[];

// Suggestions only — disciplines are stored as free text on the backend
// since the client hasn't confirmed a fixed taxonomy (same reasoning as the
// existing tradeType field). These populate a datalist, not a closed enum.
export const DISCIPLINE_SUGGESTIONS: Partial<Record<OrganisationClassification, string[]>> = {
  CONSULTANT: [
    'Architect',
    'Quantity Surveyor',
    'Civil Engineer',
    'Structural Engineer',
    'Mechanical Engineer',
    'Electrical Engineer',
    'Geotechnical Engineer',
    'Environmental Consultant',
    'Project Manager',
    'Development Manager',
    'Town Planner',
    'Landscape Architect',
    'Interior Designer',
  ],
  CONTRACTOR: [
    'Building Contractor',
    'Civil Contractor',
    'Structural Contractor',
    'MEP Contractor',
    'Electrical Contractor',
    'Plumbing Contractor',
    'HVAC Contractor',
    'Road Contractor',
    'Earthworks Contractor',
    'Roofing Contractor',
    'Finishing Contractor',
  ],
  SPECIALIST_CONTRACTOR: ['Building Contractor', 'Civil Contractor', 'Structural Contractor', 'MEP Contractor', 'Roofing Contractor'],
  SUBCONTRACTOR: ['Electrical Contractor', 'Plumbing Contractor', 'HVAC Contractor', 'Finishing Contractor'],
  SUPPLIER: [
    'Building Materials',
    'Steel',
    'Cement',
    'Aggregates',
    'Plumbing',
    'Electrical',
    'Doors & Windows',
    'Finishes',
    'Furniture',
    'Plant & Equipment',
    'PPE',
    'Mechanical Equipment',
  ],
  MANUFACTURER: ['Steel', 'Cement', 'Timber', 'Tiles', 'Doors', 'Roofing', 'Glass', 'Aluminium'],
};

export type OrganisationRegistrationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'MORE_INFO_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'ARCHIVED';

export const REGISTRATION_STATUS_LABEL: Record<OrganisationRegistrationStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  MORE_INFO_REQUIRED: 'More Information Required',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  ARCHIVED: 'Archived',
};

export const REGISTRATION_STATUSES = Object.keys(REGISTRATION_STATUS_LABEL) as OrganisationRegistrationStatus[];

export const REGISTRATION_STATUS_TONE: Record<OrganisationRegistrationStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  SUBMITTED: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  MORE_INFO_REQUIRED: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export type OrganisationPrequalificationStatus =
  | 'NOT_ASSESSED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'PREQUALIFIED'
  | 'CONDITIONALLY_PREQUALIFIED'
  | 'REJECTED'
  | 'SUSPENDED';

export const PREQUALIFICATION_STATUS_LABEL: Record<OrganisationPrequalificationStatus, string> = {
  NOT_ASSESSED: 'Not Assessed',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  PREQUALIFIED: 'Prequalified',
  CONDITIONALLY_PREQUALIFIED: 'Conditionally Prequalified',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

export const PREQUALIFICATION_STATUSES = Object.keys(PREQUALIFICATION_STATUS_LABEL) as OrganisationPrequalificationStatus[];

export type ComplianceVerificationStatus = 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';

export const VERIFICATION_STATUS_LABEL: Record<ComplianceVerificationStatus, string> = {
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export const VERIFICATION_STATUSES = Object.keys(VERIFICATION_STATUS_LABEL) as ComplianceVerificationStatus[];

export type ComputedComplianceStatus = 'EXPIRED' | 'PENDING_VERIFICATION' | 'EXPIRING_SOON' | 'VALID';

export const COMPUTED_STATUS_LABEL: Record<ComputedComplianceStatus, string> = {
  EXPIRED: 'Expired',
  PENDING_VERIFICATION: 'Pending Verification',
  EXPIRING_SOON: 'Expiring Soon',
  VALID: 'Valid',
};

export const COMPUTED_STATUS_TONE: Record<ComputedComplianceStatus, string> = {
  EXPIRED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  PENDING_VERIFICATION: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  EXPIRING_SOON: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  VALID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

export type OrganisationProjectRole =
  | 'CLIENT'
  | 'DEVELOPMENT_MANAGER'
  | 'PROJECT_MANAGER'
  | 'ARCHITECT'
  | 'QUANTITY_SURVEYOR'
  | 'CIVIL_ENGINEER'
  | 'STRUCTURAL_ENGINEER'
  | 'MAIN_CONTRACTOR'
  | 'SUBCONTRACTOR'
  | 'SUPPLIER'
  | 'CONSULTANT'
  | 'OTHER';

export const APPOINTMENT_ROLE_LABEL: Record<OrganisationProjectRole, string> = {
  CLIENT: 'Client',
  DEVELOPMENT_MANAGER: 'Development Manager',
  PROJECT_MANAGER: 'Project Manager',
  ARCHITECT: 'Architect',
  QUANTITY_SURVEYOR: 'Quantity Surveyor',
  CIVIL_ENGINEER: 'Civil Engineer',
  STRUCTURAL_ENGINEER: 'Structural Engineer',
  MAIN_CONTRACTOR: 'Main Contractor',
  SUBCONTRACTOR: 'Subcontractor',
  SUPPLIER: 'Supplier',
  CONSULTANT: 'Consultant',
  OTHER: 'Other',
};

export const APPOINTMENT_ROLES = Object.keys(APPOINTMENT_ROLE_LABEL) as OrganisationProjectRole[];

export type OrganisationAppointmentStatus = 'PROPOSED' | 'APPOINTED' | 'ACTIVE' | 'COMPLETED' | 'TERMINATED';

export const APPOINTMENT_STATUS_LABEL: Record<OrganisationAppointmentStatus, string> = {
  PROPOSED: 'Proposed',
  APPOINTED: 'Appointed',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  TERMINATED: 'Terminated',
};

export const APPOINTMENT_STATUSES = Object.keys(APPOINTMENT_STATUS_LABEL) as OrganisationAppointmentStatus[];

// Drives the "Required: X | Uploaded: Y | Verified: Z" counter. Keyed by
// classification rather than by discipline (e.g. "Architect" specifically) —
// coarser than the spec's examples, but the app doesn't model disciplines as
// a closed set to key off precisely. An organisation with several
// classifications needs the union of each one's required documents.
const REQUIRED_DOCS_BY_CLASSIFICATION: Record<OrganisationClassification, string[]> = {
  CONTRACTOR: ['Company Registration', 'Contractor Licence', 'Tax Certificate', 'Insurance Certificate', 'HSE Certificate', 'Company Profile'],
  SPECIALIST_CONTRACTOR: ['Company Registration', 'Contractor Licence', 'Tax Certificate', 'Insurance Certificate', 'HSE Certificate'],
  SUBCONTRACTOR: ['Company Registration', 'Tax Certificate', 'Insurance Certificate', 'HSE Certificate'],
  CONSULTANT: ['Company Registration', 'Professional Registration', 'Practising Certificate', 'Professional Indemnity Insurance', 'Tax Certificate'],
  SUPPLIER: ['Company Registration', 'Tax Certificate', 'Product Catalogue'],
  MANUFACTURER: ['Company Registration', 'Tax Certificate', 'Product Catalogue'],
  SERVICE_PROVIDER: ['Company Registration', 'Tax Certificate'],
  OTHER: ['Company Registration', 'Tax Certificate'],
};

export function requiredDocumentTypes(classifications: OrganisationClassification[]): string[] {
  const set = new Set<string>();
  for (const c of classifications) {
    for (const doc of REQUIRED_DOCS_BY_CLASSIFICATION[c] ?? []) set.add(doc);
  }
  if (set.size === 0) for (const doc of REQUIRED_DOCS_BY_CLASSIFICATION.OTHER) set.add(doc);
  return Array.from(set);
}

export type RaterType = 'INTERNAL' | 'CLIENT';

export const RATER_TYPE_LABEL: Record<RaterType, string> = {
  INTERNAL: 'Setjeka (internal)',
  CLIENT: 'Client',
};

export const RATER_TYPES = Object.keys(RATER_TYPE_LABEL) as RaterType[];

