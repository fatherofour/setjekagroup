-- Non-conformance reports (register QHSE "NCR"; 2026-10-29).
-- CreateEnum
CREATE TYPE "NcrKind" AS ENUM ('MATERIAL', 'WORKMANSHIP', 'DESIGN', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "NcrSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NcrStatus" AS ENUM ('OPEN', 'RESPONDED', 'ACTION_AGREED', 'READY_FOR_VERIFICATION', 'CLOSED', 'VOID');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'NCR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'NCR_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'NCR_RESPONDED';
ALTER TYPE "NotificationType" ADD VALUE 'NCR_READY';
ALTER TYPE "NotificationType" ADD VALUE 'NCR_DECIDED';

-- CreateTable
CREATE TABLE "NonConformance" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "NcrKind" NOT NULL DEFAULT 'WORKMANSHIP',
    "severity" "NcrSeverity" NOT NULL DEFAULT 'MINOR',
    "location" TEXT,
    "status" "NcrStatus" NOT NULL DEFAULT 'OPEN',
    "raisedById" TEXT NOT NULL,
    "assigneeId" TEXT,
    "inspectionId" TEXT,
    "dueDate" TIMESTAMP(3),
    "rootCauseCategory" TEXT,
    "rootCause" TEXT,
    "correctiveAction" TEXT,
    "preventiveAction" TEXT,
    "costImpact" DOUBLE PRECISION,
    "timeImpactDays" INTEGER,
    "respondedAt" TIMESTAMP(3),
    "agreedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonConformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NcrEvent" (
    "id" TEXT NOT NULL,
    "ncrId" TEXT NOT NULL,
    "fromStatus" "NcrStatus",
    "toStatus" "NcrStatus" NOT NULL,
    "actorId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NcrEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NonConformance_projectId_status_idx" ON "NonConformance"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NonConformance_projectId_sequence_key" ON "NonConformance"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "NcrEvent_ncrId_idx" ON "NcrEvent"("ncrId");

-- AddForeignKey
ALTER TABLE "NonConformance" ADD CONSTRAINT "NonConformance_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformance" ADD CONSTRAINT "NonConformance_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformance" ADD CONSTRAINT "NonConformance_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformance" ADD CONSTRAINT "NonConformance_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SiteInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformance" ADD CONSTRAINT "NonConformance_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcrEvent" ADD CONSTRAINT "NcrEvent_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "NonConformance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NcrEvent" ADD CONSTRAINT "NcrEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

