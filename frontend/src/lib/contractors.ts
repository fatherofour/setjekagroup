import type { OrganisationClassification, OrganisationRegistrationStatus, OrganisationPrequalificationStatus } from './organisationMeta';

export interface Contractor {
  id: string;
  name: string;
  tradingName: string | null;
  tradeType: string | null;
  disciplines: string[];
  classifications: OrganisationClassification[];
  registrationNumber: string | null;
  taxVatNumber: string | null;
  country: string | null;
  stateProvince: string | null;
  city: string | null;
  yearEstablished: number | null;
  website: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  registrationStatus: OrganisationRegistrationStatus;
  prequalificationStatus: OrganisationPrequalificationStatus;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  preferredPaymentMethod: string | null;
  paymentTerms: string | null;
  creditTerms: string | null;
  withholdingTaxInfo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationContact {
  id: string;
  contractorId: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contactType: string | null;
  isPrimary: boolean;
  canReceiveRfqs: boolean;
  canReceiveCorrespondence: boolean;
  canReceivePaymentNotifications: boolean;
  isActive: boolean;
}

export interface ComplianceRecord {
  id: string;
  contractorId: string;
  documentType: string;
  documentNumber: string | null;
  issuingAuthority: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  verificationStatus: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';
  verifiedById: string | null;
  verifiedAt: string | null;
  notes: string | null;
  attachmentFilename: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  sharePointUrl: string | null;
  computedStatus: 'EXPIRED' | 'PENDING_VERIFICATION' | 'EXPIRING_SOON' | 'VALID';
}

export interface OrganisationAppointment {
  id: string;
  contractorId: string;
  projectId: string;
  role: import('./organisationMeta').OrganisationProjectRole;
  appointmentType: string | null;
  appointmentDate: string | null;
  appointmentReference: string | null;
  contractReference: string | null;
  contractValue: number | null;
  currency: 'USD' | 'ZAR' | null;
  scopeOfWork: string | null;
  startDate: string | null;
  endDate: string | null;
  appointmentStatus: import('./organisationMeta').OrganisationAppointmentStatus;
  project: { id: string; name: string; projectCode: string | null };
}

export interface OrganisationStatusHistoryEntry {
  id: string;
  contractorId: string;
  previousStatus: string;
  newStatus: string;
  changedById: string;
  comment: string | null;
  changedAt: string;
}

export interface ContractorDetail extends Contractor {
  contacts: OrganisationContact[];
  complianceRecords: ComplianceRecord[];
  appointments: OrganisationAppointment[];
  statusHistory: OrganisationStatusHistoryEntry[];
}
