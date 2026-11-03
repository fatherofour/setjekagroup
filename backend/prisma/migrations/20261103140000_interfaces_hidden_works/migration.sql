-- CreateEnum
CREATE TYPE "InterfaceType" AS ENUM ('PHYSICAL', 'FUNCTIONAL', 'SPATIAL', 'INFORMATION', 'SCHEDULE', 'CONTRACTUAL');

-- CreateEnum
CREATE TYPE "InterfaceStatus" AS ENUM ('OPEN', 'PROPOSED', 'AGREED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HiddenWorkStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'COVERED', 'COVERED_UNAPPROVED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommentEntityType" ADD VALUE 'INTERFACE';
ALTER TYPE "CommentEntityType" ADD VALUE 'HIDDEN_WORK';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'INTERFACE_RAISED';
ALTER TYPE "NotificationType" ADD VALUE 'INTERFACE_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE 'INTERFACE_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'HIDDEN_WORK_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'HIDDEN_WORK_DECIDED';

-- AlterTable
ALTER TABLE "NonConformance" ADD COLUMN     "hiddenWorkId" TEXT;

-- AlterTable
ALTER TABLE "SitePhoto" ADD COLUMN     "hiddenWorkId" TEXT;

-- CreateTable
CREATE TABLE "ProjectInterface" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "InterfaceType" NOT NULL DEFAULT 'PHYSICAL',
    "location" TEXT,
    "ownerId" TEXT NOT NULL,
    "accepterId" TEXT NOT NULL,
    "needBy" TIMESTAMP(3),
    "scheduleActivityId" TEXT,
    "rfiId" TEXT,
    "status" "InterfaceStatus" NOT NULL DEFAULT 'OPEN',
    "agreedDetail" TEXT,
    "proposedAt" TIMESTAMP(3),
    "agreedAt" TIMESTAMP(3),
    "agreedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "cancelReason" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInterface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenWork" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trade" TEXT,
    "location" TEXT,
    "contractorId" TEXT,
    "scheduleActivityId" TEXT,
    "inspectorId" TEXT,
    "readyAt" TIMESTAMP(3),
    "asBuilt" TEXT,
    "status" "HiddenWorkStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decisionComment" TEXT,
    "coveredAt" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiddenWork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectInterface_projectId_status_idx" ON "ProjectInterface"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInterface_projectId_sequence_key" ON "ProjectInterface"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "HiddenWork_projectId_status_idx" ON "HiddenWork"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenWork_projectId_sequence_key" ON "HiddenWork"("projectId", "sequence");

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_hiddenWorkId_fkey" FOREIGN KEY ("hiddenWorkId") REFERENCES "HiddenWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformance" ADD CONSTRAINT "NonConformance_hiddenWorkId_fkey" FOREIGN KEY ("hiddenWorkId") REFERENCES "HiddenWork"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterface" ADD CONSTRAINT "ProjectInterface_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterface" ADD CONSTRAINT "ProjectInterface_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ProjectMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterface" ADD CONSTRAINT "ProjectInterface_accepterId_fkey" FOREIGN KEY ("accepterId") REFERENCES "ProjectMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterface" ADD CONSTRAINT "ProjectInterface_scheduleActivityId_fkey" FOREIGN KEY ("scheduleActivityId") REFERENCES "ScheduleActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterface" ADD CONSTRAINT "ProjectInterface_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterface" ADD CONSTRAINT "ProjectInterface_agreedById_fkey" FOREIGN KEY ("agreedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInterface" ADD CONSTRAINT "ProjectInterface_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWork" ADD CONSTRAINT "HiddenWork_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWork" ADD CONSTRAINT "HiddenWork_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWork" ADD CONSTRAINT "HiddenWork_scheduleActivityId_fkey" FOREIGN KEY ("scheduleActivityId") REFERENCES "ScheduleActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWork" ADD CONSTRAINT "HiddenWork_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWork" ADD CONSTRAINT "HiddenWork_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenWork" ADD CONSTRAINT "HiddenWork_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

