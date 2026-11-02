-- Measured contracts: site measurement and daywork sheets (2026-11-02).
-- CreateEnum
CREATE TYPE "MeasurementStatus" AS ENUM ('RECORDED', 'AGREED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DayworkStatus" AS ENUM ('SUBMITTED', 'SIGNED', 'REJECTED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'DAYWORK';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'MEASUREMENT_RECORDED';
ALTER TYPE "NotificationType" ADD VALUE 'MEASUREMENT_DISPUTED';
ALTER TYPE "NotificationType" ADD VALUE 'DAYWORK_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'DAYWORK_DECIDED';

-- AlterTable
ALTER TABLE "ProjectContract" ADD COLUMN     "measured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ValuationLine" ADD COLUMN     "dayworkSheetId" TEXT,
ADD COLUMN     "quantityToDate" DOUBLE PRECISION,
ADD COLUMN     "rate" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SiteMeasurement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "costPlanItemId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "status" "MeasurementStatus" NOT NULL DEFAULT 'RECORDED',
    "recordedById" TEXT NOT NULL,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayworkSheet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "labour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "plant" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "materials" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "DayworkStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayworkSheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteMeasurement_contractId_costPlanItemId_idx" ON "SiteMeasurement"("contractId", "costPlanItemId");

-- CreateIndex
CREATE INDEX "DayworkSheet_projectId_idx" ON "DayworkSheet"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "DayworkSheet_contractId_sequence_key" ON "DayworkSheet"("contractId", "sequence");

-- AddForeignKey
ALTER TABLE "ValuationLine" ADD CONSTRAINT "ValuationLine_dayworkSheetId_fkey" FOREIGN KEY ("dayworkSheetId") REFERENCES "DayworkSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasurement" ADD CONSTRAINT "SiteMeasurement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasurement" ADD CONSTRAINT "SiteMeasurement_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasurement" ADD CONSTRAINT "SiteMeasurement_costPlanItemId_fkey" FOREIGN KEY ("costPlanItemId") REFERENCES "CostPlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasurement" ADD CONSTRAINT "SiteMeasurement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteMeasurement" ADD CONSTRAINT "SiteMeasurement_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayworkSheet" ADD CONSTRAINT "DayworkSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayworkSheet" ADD CONSTRAINT "DayworkSheet_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayworkSheet" ADD CONSTRAINT "DayworkSheet_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayworkSheet" ADD CONSTRAINT "DayworkSheet_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

