// Matches the User Roles sheet in the Setjeka Feature and Functional
// Requirements Register.
export type ProjectMemberRole =
  | 'DEVELOPMENT_MANAGER'
  | 'PROJECT_MANAGER'
  | 'PLANNER_SCHEDULER'
  | 'QUANTITY_SURVEYOR'
  | 'PROCUREMENT_MANAGER'
  | 'ARCHITECT_ENGINEER'
  | 'SITE_MANAGER'
  | 'QA_QC_MANAGER'
  | 'HSE_MANAGER'
  | 'CONTRACTOR'
  | 'CLIENT'
  | 'OTHER';

export const PROJECT_MEMBER_ROLES: { value: ProjectMemberRole; label: string }[] = [
  { value: 'DEVELOPMENT_MANAGER', label: 'Development Manager' },
  { value: 'PROJECT_MANAGER', label: 'Project Director / Project Manager' },
  { value: 'PLANNER_SCHEDULER', label: 'Planner / Scheduler' },
  { value: 'QUANTITY_SURVEYOR', label: 'Quantity Surveyor / Commercial Manager' },
  { value: 'PROCUREMENT_MANAGER', label: 'Procurement Manager' },
  { value: 'ARCHITECT_ENGINEER', label: 'Architect / Civil / Structural Engineer' },
  { value: 'SITE_MANAGER', label: 'Site Manager / Site Engineer' },
  { value: 'QA_QC_MANAGER', label: 'QA/QC Manager' },
  { value: 'HSE_MANAGER', label: 'HSE Manager' },
  { value: 'CONTRACTOR', label: 'Contractor' },
  { value: 'CLIENT', label: 'Client / Developer' },
  { value: 'OTHER', label: 'Other' },
];

export function projectMemberRoleLabel(role: ProjectMemberRole): string {
  return PROJECT_MEMBER_ROLES.find((r) => r.value === role)?.label ?? role;
}
