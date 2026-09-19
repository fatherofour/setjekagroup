/*
  Warnings:

  - You are about to drop the column `procsaStage` on the `Project` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('INITIATION', 'INCEPTION', 'CONCEPT', 'DESIGN', 'DOCUMENTATION_PROCUREMENT', 'CONSTRUCTION', 'CLOSEOUT');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('NEW_BUILD', 'REFURBISHMENT', 'REDEVELOPMENT', 'RENEWAL', 'ADDITION');

-- CreateEnum
CREATE TYPE "ContractForm" AS ENUM ('FIDIC', 'JBCC', 'GCC', 'NEC', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectNodeType" AS ENUM ('PHASE', 'BUILDING', 'FLOOR', 'ZONE', 'WORK_PACKAGE');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'PLANNER_SCHEDULER', 'QUANTITY_SURVEYOR', 'PROCUREMENT_MANAGER', 'ARCHITECT_ENGINEER', 'SITE_MANAGER', 'QA_QC_MANAGER', 'HSE_MANAGER', 'CONTRACTOR', 'CLIENT', 'OTHER');

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "procsaStage",
ADD COLUMN     "client" TEXT,
ADD COLUMN     "contractForm" "ContractForm",
ADD COLUMN     "developer" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "projectType" "ProjectType",
ADD COLUMN     "stage" "ProjectStage" NOT NULL DEFAULT 'INITIATION',
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "value" DOUBLE PRECISION;

-- DropEnum
DROP TYPE "ProcsaStage";

-- CreateTable
CREATE TABLE "ProjectNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "ProjectNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,
    "externalCompany" TEXT,
    "externalEmail" TEXT,
    "externalPhone" TEXT,
    "role" "ProjectMemberRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectNode_projectId_idx" ON "ProjectNode"("projectId");

-- CreateIndex
CREATE INDEX "ProjectNode_parentId_idx" ON "ProjectNode"("parentId");

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectNode" ADD CONSTRAINT "ProjectNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNode" ADD CONSTRAINT "ProjectNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
