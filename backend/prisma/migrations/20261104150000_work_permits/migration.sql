-- CreateEnum
CREATE TYPE "PermitType" AS ENUM ('HOT_WORK', 'WORKING_AT_HEIGHT', 'EXCAVATION', 'CONFINED_SPACE', 'ELECTRICAL_ISOLATION', 'LIFTING', 'OTHER');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('REQUESTED', 'ISSUED', 'SUSPENDED', 'HANDED_BACK', 'CLOSED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'WORK_PERMIT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PERMIT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'PERMIT_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'PERMIT_HANDED_BACK';

-- CreateTable
CREATE TABLE "WorkPermit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "type" "PermitType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "contractorId" TEXT,
    "workers" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "gasTest" TEXT,
    "status" "PermitStatus" NOT NULL DEFAULT 'REQUESTED',
    "conditions" TEXT,
    "requestedById" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "handedBackAt" TIMESTAMP(3),
    "handBackNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "reason" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPermit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkPermit_projectId_status_idx" ON "WorkPermit"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPermit_projectId_sequence_key" ON "WorkPermit"("projectId", "sequence");

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPermit" ADD CONSTRAINT "WorkPermit_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

