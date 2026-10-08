import 'dotenv/config';
import { PrismaClient, type ProjectMemberRole, type PermissionModule, type PermissionAction } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'setjeka@setjekagroup.co.za';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Set SEED_ADMIN_PASSWORD before running the seed script');
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, fullName: 'Setjeka Admin', role: 'ADMIN' },
  });

  console.log(`Seeded user ${user.email} (${user.id})`);

  await seedDefaultRolePermissions();
  await seedCostCodes();
}

// Starter standard cost codes; editable afterwards. The cost database
// itself (regions, prices, work items) is left empty for Setjeka to fill.
const COST_CODES: [string, string, 'WORKS' | 'CONSULTANTS' | 'PROCUREMENT' | 'OVERHEADS'][] = [
  ['01', 'Preliminaries & general', 'WORKS'],
  ['02', 'Site clearance & earthworks', 'WORKS'],
  ['03', 'Substructure', 'WORKS'],
  ['04', 'Concrete frame & slabs', 'WORKS'],
  ['05', 'Masonry & walling', 'WORKS'],
  ['06', 'Roofing', 'WORKS'],
  ['07', 'Doors & windows', 'WORKS'],
  ['08', 'Finishes', 'WORKS'],
  ['09', 'Plumbing & drainage', 'WORKS'],
  ['10', 'Electrical installation', 'WORKS'],
  ['11', 'Mechanical installation', 'WORKS'],
  ['12', 'External works', 'WORKS'],
  ['13', 'Provisional sums', 'WORKS'],
  ['20', 'Professional fees', 'CONSULTANTS'],
  ['30', 'Owner-supplied materials & equipment', 'PROCUREMENT'],
  ['40', 'Statutory fees & approvals', 'OVERHEADS'],
  ['41', 'Development overheads', 'OVERHEADS'],
  ['42', 'Finance costs', 'OVERHEADS'],
];

async function seedCostCodes() {
  for (const [i, [code, name, category]] of COST_CODES.entries()) {
    await prisma.costCode.upsert({ where: { code }, update: {}, create: { code, name, category, sortOrder: (i + 1) * 10 } });
  }
  console.log(`Seeded ${COST_CODES.length} cost codes`);
}

// Requirements Register PLT / Identity & Access "Role-based access
// control" default matrix. The internal delivery-team roles get full
// access everywhere; CONTRACTOR gets view/comment broadly plus create/
// edit on the modules they actually submit into; CLIENT gets view/comment
// plus approve on the review/sign-off workflows (RFIs, Submittals, and
// the project stage gate); OTHER is view/comment only. Admin-editable
// afterwards via PermissionsController - this is only the starting
// default.
const FULL_ACCESS_ROLES: ProjectMemberRole[] = [
  'DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PLANNER_SCHEDULER', 'QUANTITY_SURVEYOR',
  'PROCUREMENT_MANAGER', 'ARCHITECT_ENGINEER', 'SITE_MANAGER', 'QA_QC_MANAGER', 'HSE_MANAGER',
];
// PROCSA consultants (external firms): contribute, don't administer.
const CONSULTANT_ROLES: ProjectMemberRole[] = ['ARCHITECT', 'STRUCTURAL_ENGINEER', 'CIVIL_ENGINEER', 'ELECTRICAL_ENGINEER', 'MECHANICAL_ENGINEER'];
const CONSULTANT_EDIT_MODULES: PermissionModule[] = [
  'TASKS', 'ISSUES', 'RISKS', 'DOCUMENTS', 'TRANSMITTALS', 'RFIS', 'SUBMITTALS', 'PROJECT_DEFINITION', 'MEETINGS',
];
const ALL_ROLES: ProjectMemberRole[] = [...FULL_ACCESS_ROLES, ...CONSULTANT_ROLES, 'CONTRACTOR', 'CLIENT', 'OTHER'];
const ALL_MODULES: PermissionModule[] = [
  'SCHEDULE', 'TASKS', 'ISSUES', 'RISKS', 'DOCUMENTS', 'TRANSMITTALS',
  'RFIS', 'SUBMITTALS', 'PROJECT_STRUCTURE', 'TEAM', 'COMMENTS', 'STAGE_GATE', 'PROCUREMENT',
  'PROJECT_DEFINITION', 'MEETINGS', 'COMMERCIAL', 'SITE_PHOTOS',
];
const ALL_ACTIONS: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'COMMENT'];
// PROCUREMENT is included so a vendor (CONTRACTOR role) can submit and
// revise their own RFQ quote - safe because the service layer scopes
// which records they can even load to their own contractorId (the
// "Vendor Portal" ask - see rfqs.service.ts and its siblings).
const CONTRACTOR_EDIT_MODULES: PermissionModule[] = ['DOCUMENTS', 'RFIS', 'SUBMITTALS', 'TASKS', 'ISSUES', 'PROCUREMENT'];

function defaultAllowed(role: ProjectMemberRole, module: PermissionModule, action: PermissionAction): boolean {
  // Budgets, variations and invoices stay with Setjeka and the client.
  // Only the client approves (variations) - Meeting 3 hard rule.
  if (module === 'COMMERCIAL') {
    if (role === 'CLIENT') return action === 'VIEW' || action === 'COMMENT' || action === 'APPROVE';
    return FULL_ACCESS_ROLES.includes(role) && action !== 'APPROVE';
  }
  // Site photos: anyone on site can add them; outside parties edit only
  // their own (SitePhotosService). Clients see what Setjeka shares.
  if (module === 'SITE_PHOTOS') {
    if (action === 'APPROVE') return false;
    if (FULL_ACCESS_ROLES.includes(role)) return true;
    if (CONSULTANT_ROLES.includes(role) || role === 'CONTRACTOR') return true;
    return action === 'VIEW' || action === 'COMMENT';
  }
  // PROCSA PM 1.9 and the Meeting 3 hard rule: the client alone approves
  // Stage 1 documents - never Setjeka on the client's behalf.
  if (module === 'PROJECT_DEFINITION' && action === 'APPROVE') return role === 'CLIENT';
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  if (CONSULTANT_ROLES.includes(role)) {
    if (action === 'VIEW' || action === 'COMMENT') return true;
    if ((action === 'CREATE' || action === 'EDIT') && CONSULTANT_EDIT_MODULES.includes(module)) return true;
    return action === 'APPROVE' && (module === 'RFIS' || module === 'SUBMITTALS');
  }
  if (role === 'CONTRACTOR') {
    if (action === 'VIEW' || action === 'COMMENT') return true;
    if ((action === 'CREATE' || action === 'EDIT') && CONTRACTOR_EDIT_MODULES.includes(module)) return true;
    return false;
  }
  if (role === 'CLIENT') {
    if (action === 'VIEW' || action === 'COMMENT') return true;
    // PROJECT_DEFINITION: the client signs off the PROCSA Stage 1 documents (PM 1.9).
    if (action === 'APPROVE' && ['RFIS', 'SUBMITTALS', 'STAGE_GATE', 'PROJECT_DEFINITION'].includes(module)) return true;
    return false;
  }
  // OTHER
  return action === 'VIEW' || action === 'COMMENT';
}

async function seedDefaultRolePermissions() {
  let count = 0;
  for (const role of ALL_ROLES) {
    for (const module of ALL_MODULES) {
      for (const action of ALL_ACTIONS) {
        await prisma.rolePermission.upsert({
          where: { role_module_action: { role, module, action } },
          update: {},
          create: { role, module, action, allowed: defaultAllowed(role, module, action) },
        });
        count += 1;
      }
    }
  }
  console.log(`Seeded ${count} default role permission rows`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
