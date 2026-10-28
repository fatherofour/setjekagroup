-- CreateEnum
CREATE TYPE "CostPlanKind" AS ENUM ('PRELIMINARY', 'ELEMENTAL', 'DETAILED', 'PRE_TENDER', 'TENDER_BOQ', 'CONTRACT_BOQ');

-- CreateEnum
CREATE TYPE "CostPlanStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "CostPlanItemType" AS ENUM ('MEASURED', 'PROVISIONAL_SUM', 'PRIME_COST_SUM', 'DAYWORK');

-- CreateEnum
CREATE TYPE "FinalAccountStatus" AS ENUM ('NOT_STARTED', 'IN_PREPARATION', 'SUBMITTED', 'AGREED');

-- CreateEnum
CREATE TYPE "ValuationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CERTIFIED', 'APPROVED', 'REJECTED', 'PAID');

-- AlterEnum
ALTER TYPE "ApprovalSubject" ADD VALUE 'PAYMENT_CERTIFICATE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COST_PLAN_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'VALUATION_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'VALUATION_RETURNED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_CERTIFICATE_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_CERTIFICATE_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'RFI_COST_IMPACT';

-- AlterTable
ALTER TABLE "Rfq" ADD COLUMN     "costPlanId" TEXT;

-- AlterTable
ALTER TABLE "RfqItem" ADD COLUMN     "costPlanItemId" TEXT;

-- AlterTable
ALTER TABLE "Variation" ADD COLUMN     "contractId" TEXT;

-- CreateTable
CREATE TABLE "CostPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "CostPlanKind" NOT NULL,
    "status" "CostPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL,
    "grossFloorArea" DOUBLE PRECISION,
    "prelimsPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "escalationPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatPct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "notes" TEXT,
    "sourceFileName" TEXT,
    "preparedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostPlanItem" (
    "id" TEXT NOT NULL,
    "costPlanId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "section" TEXT,
    "ref" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" "CostPlanItemType" NOT NULL DEFAULT 'MEASURED',
    "costCodeId" TEXT,
    "notes" TEXT,

    CONSTRAINT "CostPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostPlanRevision" (
    "id" TEXT NOT NULL,
    "costPlanId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostPlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContract" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contractForm" "ContractForm",
    "contractSum" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL,
    "costPlanId" TEXT,
    "rfqId" TEXT,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "retentionLimitPct" DOUBLE PRECISION DEFAULT 5,
    "vatPct" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "startDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "finalAccountStatus" "FinalAccountStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "finalAccountEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "status" "ValuationStatus" NOT NULL DEFAULT 'DRAFT',
    "materialsOnSite" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionReleasePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workDone" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variationsDone" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossValuation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retention" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumulativeNet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previouslyCertified" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amountDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "preparedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "returnedReason" TEXT,
    "certificateNumber" TEXT,
    "certifiedById" TEXT,
    "certifiedAt" TIMESTAMP(3),
    "registerEntryId" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionOutcome" "ApprovalOutcome",
    "decisionComment" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuationLine" (
    "id" TEXT NOT NULL,
    "valuationId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "costPlanItemId" TEXT,
    "variationId" TEXT,
    "description" TEXT NOT NULL,
    "contractAmount" DOUBLE PRECISION NOT NULL,
    "percentComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valueToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ValuationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostPlan_projectId_idx" ON "CostPlan"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CostPlan_projectId_number_key" ON "CostPlan"("projectId", "number");

-- CreateIndex
CREATE INDEX "CostPlanItem_costPlanId_idx" ON "CostPlanItem"("costPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "CostPlanRevision_costPlanId_revision_key" ON "CostPlanRevision"("costPlanId", "revision");

-- CreateIndex
CREATE INDEX "ProjectContract_projectId_idx" ON "ProjectContract"("projectId");

-- CreateIndex
CREATE INDEX "Valuation_projectId_idx" ON "Valuation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_contractId_number_key" ON "Valuation"("contractId", "number");

-- CreateIndex
CREATE INDEX "ValuationLine_valuationId_idx" ON "ValuationLine"("valuationId");

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_costPlanId_fkey" FOREIGN KEY ("costPlanId") REFERENCES "CostPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqItem" ADD CONSTRAINT "RfqItem_costPlanItemId_fkey" FOREIGN KEY ("costPlanItemId") REFERENCES "CostPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPlan" ADD CONSTRAINT "CostPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPlan" ADD CONSTRAINT "CostPlan_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPlan" ADD CONSTRAINT "CostPlan_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPlanItem" ADD CONSTRAINT "CostPlanItem_costPlanId_fkey" FOREIGN KEY ("costPlanId") REFERENCES "CostPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPlanItem" ADD CONSTRAINT "CostPlanItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPlanRevision" ADD CONSTRAINT "CostPlanRevision_costPlanId_fkey" FOREIGN KEY ("costPlanId") REFERENCES "CostPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostPlanRevision" ADD CONSTRAINT "CostPlanRevision_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_costPlanId_fkey" FOREIGN KEY ("costPlanId") REFERENCES "CostPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContract" ADD CONSTRAINT "ProjectContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_certifiedById_fkey" FOREIGN KEY ("certifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationLine" ADD CONSTRAINT "ValuationLine_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "Valuation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationLine" ADD CONSTRAINT "ValuationLine_costPlanItemId_fkey" FOREIGN KEY ("costPlanItemId") REFERENCES "CostPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuationLine" ADD CONSTRAINT "ValuationLine_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

