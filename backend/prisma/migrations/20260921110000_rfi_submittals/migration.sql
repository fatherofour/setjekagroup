-- CreateEnum
CREATE TYPE "RfiStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmittalStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISE_AND_RESUBMIT', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommentEntityType" ADD VALUE 'RFI';
ALTER TYPE "CommentEntityType" ADD VALUE 'SUBMITTAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'RFI_BALL_IN_COURT';
ALTER TYPE "NotificationType" ADD VALUE 'SUBMITTAL_STATUS_CHANGED';

-- CreateTable
CREATE TABLE "Rfi" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "rfiNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT,
    "officialResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "raisedById" TEXT,
    "assignedToId" TEXT,
    "ballInCourtId" TEXT,
    "priority" "SchedulePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "RfiStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "costImpactPotential" DOUBLE PRECISION,
    "costImpactConfirmed" DOUBLE PRECISION,
    "scheduleImpactPotentialDays" DOUBLE PRECISION,
    "scheduleImpactConfirmedDays" DOUBLE PRECISION,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submittal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "submittalNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "specSection" TEXT,
    "submittalType" TEXT,
    "submittedById" TEXT,
    "reviewerId" TEXT,
    "status" "SubmittalStatus" NOT NULL DEFAULT 'SUBMITTED',
    "dueDate" TIMESTAMP(3),
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submittal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmittalStatusHistory" (
    "id" TEXT NOT NULL,
    "submittalId" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittalStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rfi_rfiNumber_key" ON "Rfi"("rfiNumber");

-- CreateIndex
CREATE INDEX "Rfi_projectId_idx" ON "Rfi"("projectId");

-- CreateIndex
CREATE INDEX "Rfi_raisedById_idx" ON "Rfi"("raisedById");

-- CreateIndex
CREATE INDEX "Rfi_assignedToId_idx" ON "Rfi"("assignedToId");

-- CreateIndex
CREATE INDEX "Rfi_ballInCourtId_idx" ON "Rfi"("ballInCourtId");

-- CreateIndex
CREATE INDEX "Rfi_documentId_idx" ON "Rfi"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Submittal_submittalNumber_key" ON "Submittal"("submittalNumber");

-- CreateIndex
CREATE INDEX "Submittal_projectId_idx" ON "Submittal"("projectId");

-- CreateIndex
CREATE INDEX "Submittal_submittedById_idx" ON "Submittal"("submittedById");

-- CreateIndex
CREATE INDEX "Submittal_reviewerId_idx" ON "Submittal"("reviewerId");

-- CreateIndex
CREATE INDEX "Submittal_documentId_idx" ON "Submittal"("documentId");

-- CreateIndex
CREATE INDEX "SubmittalStatusHistory_submittalId_idx" ON "SubmittalStatusHistory"("submittalId");

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_ballInCourtId_fkey" FOREIGN KEY ("ballInCourtId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfi" ADD CONSTRAINT "Rfi_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submittal" ADD CONSTRAINT "Submittal_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalStatusHistory" ADD CONSTRAINT "SubmittalStatusHistory_submittalId_fkey" FOREIGN KEY ("submittalId") REFERENCES "Submittal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmittalStatusHistory" ADD CONSTRAINT "SubmittalStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

