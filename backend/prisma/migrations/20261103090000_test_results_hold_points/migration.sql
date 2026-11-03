-- CreateEnum
CREATE TYPE "TestRule" AS ENUM ('MIN', 'MAX', 'RANGE', 'PASS_FAIL');

-- CreateEnum
CREATE TYPE "TestOutcome" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "TestResultStatus" AS ENUM ('RECORDED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "HoldPointKind" AS ENUM ('HOLD', 'WITNESS');

-- CreateEnum
CREATE TYPE "HoldPointStatus" AS ENUM ('PLANNED', 'NOTIFIED', 'RELEASED', 'PROCEEDED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommentEntityType" ADD VALUE 'TEST_RESULT';
ALTER TYPE "CommentEntityType" ADD VALUE 'HOLD_POINT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TEST_RECORDED';
ALTER TYPE "NotificationType" ADD VALUE 'TEST_FAILED';
ALTER TYPE "NotificationType" ADD VALUE 'HOLD_POINT_NOTIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'HOLD_POINT_DECIDED';

-- AlterTable
ALTER TABLE "NonConformance" ADD COLUMN     "testResultId" TEXT;

-- CreateTable
CREATE TABLE "TestCriterion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "standardRef" TEXT,
    "unit" TEXT,
    "rule" "TestRule" NOT NULL,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "frequency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "contractorId" TEXT,
    "scheduleActivityId" TEXT,
    "holdPointId" TEXT,
    "retestOfId" TEXT,
    "sampleRef" TEXT,
    "laboratory" TEXT,
    "sampledAt" TIMESTAMP(3),
    "testedAt" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION,
    "outcome" "TestOutcome" NOT NULL,
    "remarks" TEXT,
    "status" "TestResultStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldPoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "HoldPointKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "scheduleActivityId" TEXT,
    "criterionId" TEXT,
    "contractorId" TEXT,
    "releaserId" TEXT,
    "noticeHours" INTEGER NOT NULL DEFAULT 24,
    "status" "HoldPointStatus" NOT NULL DEFAULT 'PLANNED',
    "readyAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "notifiedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releaseComment" TEXT,
    "cancelReason" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldPoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestCriterion_projectId_code_key" ON "TestCriterion"("projectId", "code");

-- CreateIndex
CREATE INDEX "TestResult_projectId_status_idx" ON "TestResult"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TestResult_projectId_sequence_key" ON "TestResult"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "HoldPoint_projectId_status_idx" ON "HoldPoint"("projectId", "status");

-- CreateIndex
CREATE INDEX "HoldPoint_scheduleActivityId_idx" ON "HoldPoint"("scheduleActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "HoldPoint_projectId_sequence_key" ON "HoldPoint"("projectId", "sequence");

-- AddForeignKey
ALTER TABLE "NonConformance" ADD CONSTRAINT "NonConformance_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestCriterion" ADD CONSTRAINT "TestCriterion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "TestCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_scheduleActivityId_fkey" FOREIGN KEY ("scheduleActivityId") REFERENCES "ScheduleActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_holdPointId_fkey" FOREIGN KEY ("holdPointId") REFERENCES "HoldPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_retestOfId_fkey" FOREIGN KEY ("retestOfId") REFERENCES "TestResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_scheduleActivityId_fkey" FOREIGN KEY ("scheduleActivityId") REFERENCES "ScheduleActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "TestCriterion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_releaserId_fkey" FOREIGN KEY ("releaserId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_notifiedById_fkey" FOREIGN KEY ("notifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldPoint" ADD CONSTRAINT "HoldPoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

