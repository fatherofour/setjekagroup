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
const ALL_ROLES: ProjectMemberRole[] = [...FULL_ACCESS_ROLES, 'CONTRACTOR', 'CLIENT', 'OTHER'];
const ALL_MODULES: PermissionModule[] = [
  'SCHEDULE', 'TASKS', 'ISSUES', 'RISKS', 'DOCUMENTS', 'TRANSMITTALS',
  'RFIS', 'SUBMITTALS', 'PROJECT_STRUCTURE', 'TEAM', 'COMMENTS', 'STAGE_GATE', 'PROCUREMENT',
];
const ALL_ACTIONS: PermissionAction[] = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'COMMENT'];
// PROCUREMENT is included so a vendor (CONTRACTOR role) can submit and
// revise their own RFQ quote - safe because the service layer scopes
// which records they can even load to their own contractorId (the
// "Vendor Portal" ask - see rfqs.service.ts and its siblings).
const CONTRACTOR_EDIT_MODULES: PermissionModule[] = ['DOCUMENTS', 'RFIS', 'SUBMITTALS', 'TASKS', 'ISSUES', 'PROCUREMENT'];

function defaultAllowed(role: ProjectMemberRole, module: PermissionModule, action: PermissionAction): boolean {
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  if (role === 'CONTRACTOR') {
    if (action === 'VIEW' || action === 'COMMENT') return true;
    if ((action === 'CREATE' || action === 'EDIT') && CONTRACTOR_EDIT_MODULES.includes(module)) return true;
    return false;
  }
  if (role === 'CLIENT') {
    if (action === 'VIEW' || action === 'COMMENT') return true;
    if (action === 'APPROVE' && (module === 'RFIS' || module === 'SUBMITTALS' || module === 'STAGE_GATE')) return true;
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
