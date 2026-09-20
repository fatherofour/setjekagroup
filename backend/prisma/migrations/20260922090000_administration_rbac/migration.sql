-- CreateEnum
CREATE TYPE "UserAccountType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PermissionModule" AS ENUM ('SCHEDULE', 'TASKS', 'ISSUES', 'RISKS', 'DOCUMENTS', 'TRANSMITTALS', 'RFIS', 'SUBMITTALS', 'PROJECT_STRUCTURE', 'TEAM', 'COMMENTS');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'COMMENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountType" "UserAccountType" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberPermissionOverride" (
    "id" TEXT NOT NULL,
    "projectMemberId" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "recordId" TEXT,
    "allowed" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "projectId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_module_action_key" ON "RolePermission"("role", "module", "action");

-- CreateIndex
CREATE INDEX "MemberPermissionOverride_projectMemberId_idx" ON "MemberPermissionOverride"("projectMemberId");

-- CreateIndex
CREATE INDEX "MemberPermissionOverride_projectMemberId_module_action_idx" ON "MemberPermissionOverride"("projectMemberId", "module", "action");

-- CreateIndex
CREATE INDEX "AuditLogEntry_userId_idx" ON "AuditLogEntry"("userId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_projectId_idx" ON "AuditLogEntry"("projectId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "MemberPermissionOverride" ADD CONSTRAINT "MemberPermissionOverride_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

