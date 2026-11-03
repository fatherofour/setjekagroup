-- CreateEnum
CREATE TYPE "DelayCause" AS ENUM ('VARIATION', 'LATE_INFORMATION', 'CLIENT_DELAY', 'SITE_ACCESS', 'WEATHER', 'STATUTORY', 'FORCE_MAJEURE', 'OTHER');

-- CreateEnum
CREATE TYPE "TimeClaimStatus" AS ENUM ('NOTIFIED', 'SUBMITTED', 'GRANTED', 'PARTLY_GRANTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClaimResponse" AS ENUM ('ACCEPTED', 'DISPUTED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'TIME_CLAIM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TIME_CLAIM_NOTIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'TIME_CLAIM_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'TIME_CLAIM_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'TIME_CLAIM_RESPONDED';

-- AlterTable
ALTER TABLE "ProjectContract" ADD COLUMN     "penaltyPerDay" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "TimeClaim" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cause" "DelayCause" NOT NULL,
    "description" TEXT NOT NULL,
    "eventStartedAt" TIMESTAMP(3) NOT NULL,
    "eventEndedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3) NOT NULL,
    "notifiedById" TEXT NOT NULL,
    "lateNoticeDays" INTEGER,
    "claimDueAt" TIMESTAMP(3) NOT NULL,
    "scheduleActivityId" TEXT,
    "variationId" TEXT,
    "rfiId" TEXT,
    "status" "TimeClaimStatus" NOT NULL DEFAULT 'NOTIFIED',
    "requestedDays" INTEGER,
    "costClaimed" DOUBLE PRECISION,
    "particulars" TEXT,
    "submittedAt" TIMESTAMP(3),
    "assessDueAt" TIMESTAMP(3),
    "grantedDays" INTEGER,
    "grantedCost" DOUBLE PRECISION,
    "assessment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "response" "ClaimResponse",
    "responseNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "costVariationId" TEXT,
    "registerEntryId" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeClaim_contractId_status_idx" ON "TimeClaim"("contractId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TimeClaim_projectId_sequence_key" ON "TimeClaim"("projectId", "sequence");

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_notifiedById_fkey" FOREIGN KEY ("notifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_scheduleActivityId_fkey" FOREIGN KEY ("scheduleActivityId") REFERENCES "ScheduleActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeClaim" ADD CONSTRAINT "TimeClaim_costVariationId_fkey" FOREIGN KEY ("costVariationId") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

