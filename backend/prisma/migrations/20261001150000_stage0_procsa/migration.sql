-- CreateEnum
CREATE TYPE "LandAcquisitionStatus" AS ENUM ('NOT_STARTED', 'NEGOTIATING', 'OFFER_MADE', 'AGREEMENT_SIGNED', 'TRANSFERRED', 'LEASED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LandRightCategory" AS ENUM ('ZONING', 'ENVIRONMENTAL', 'INFRASTRUCTURE', 'LEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketResearchStatus" AS ENUM ('COMMISSIONED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OpportunityPaymentStatus" AS ENUM ('INVOICED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvestmentDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "clientVision" TEXT,
ADD COLUMN     "needAndDesirability" TEXT,
ADD COLUMN     "visionConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "visionConfirmedById" TEXT;

-- AlterTable
ALTER TABLE "OpportunityApproval" ADD COLUMN     "authority" TEXT,
ADD COLUMN     "category" "LandRightCategory",
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "siteId" TEXT;

-- AlterTable
ALTER TABLE "OpportunitySite" ADD COLUMN     "acquisitionStatus" "LandAcquisitionStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "agreedPrice" DOUBLE PRECISION,
ADD COLUMN     "agreementDate" TIMESTAMP(3),
ADD COLUMN     "transferDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ViabilityScenario" ADD COLUMN     "opportunityId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MarketResearch" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "providerId" TEXT,
    "providerName" TEXT,
    "status" "MarketResearchStatus" NOT NULL DEFAULT 'COMMISSIONED',
    "commissionedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "recommendedProduct" TEXT,
    "targetMarket" TEXT,
    "achievableRentPerSqmMonth" DOUBLE PRECISION,
    "achievableSalePricePerSqm" DOUBLE PRECISION,
    "expectedVacancyPct" DOUBLE PRECISION,
    "demandEvidence" TEXT,
    "findings" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketResearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityPayment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "contractorId" TEXT,
    "appointmentId" TEXT,
    "payeeName" TEXT,
    "description" TEXT NOT NULL,
    "invoiceReference" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "OpportunityPaymentStatus" NOT NULL DEFAULT 'INVOICED',
    "recordedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityDocument" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "linkType" TEXT,
    "linkId" TEXT,
    "storedName" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentDecision" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "InvestmentDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestComment" TEXT,
    "decidedById" TEXT,
    "decisionComment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentMilestone" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "baselineDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevelopmentMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityCheck" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "doneById" TEXT NOT NULL,
    "note" TEXT,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketResearch_opportunityId_idx" ON "MarketResearch"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityPayment_opportunityId_idx" ON "OpportunityPayment"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityDocument_opportunityId_idx" ON "OpportunityDocument"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityDocument_linkType_linkId_idx" ON "OpportunityDocument"("linkType", "linkId");

-- CreateIndex
CREATE INDEX "InvestmentDecision_opportunityId_idx" ON "InvestmentDecision"("opportunityId");

-- CreateIndex
CREATE INDEX "DevelopmentMilestone_opportunityId_idx" ON "DevelopmentMilestone"("opportunityId");

-- CreateIndex
CREATE INDEX "DevelopmentMilestone_projectId_idx" ON "DevelopmentMilestone"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityCheck_opportunityId_roleKey_code_key" ON "OpportunityCheck"("opportunityId", "roleKey", "code");

-- CreateIndex
CREATE INDEX "ViabilityScenario_opportunityId_idx" ON "ViabilityScenario"("opportunityId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_visionConfirmedById_fkey" FOREIGN KEY ("visionConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketResearch" ADD CONSTRAINT "MarketResearch_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketResearch" ADD CONSTRAINT "MarketResearch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketResearch" ADD CONSTRAINT "MarketResearch_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPayment" ADD CONSTRAINT "OpportunityPayment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPayment" ADD CONSTRAINT "OpportunityPayment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPayment" ADD CONSTRAINT "OpportunityPayment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "OpportunityAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPayment" ADD CONSTRAINT "OpportunityPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityPayment" ADD CONSTRAINT "OpportunityPayment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityDocument" ADD CONSTRAINT "OpportunityDocument_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityDocument" ADD CONSTRAINT "OpportunityDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentDecision" ADD CONSTRAINT "InvestmentDecision_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentDecision" ADD CONSTRAINT "InvestmentDecision_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentDecision" ADD CONSTRAINT "InvestmentDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentMilestone" ADD CONSTRAINT "DevelopmentMilestone_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentMilestone" ADD CONSTRAINT "DevelopmentMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCheck" ADD CONSTRAINT "OpportunityCheck_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityCheck" ADD CONSTRAINT "OpportunityCheck_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApproval" ADD CONSTRAINT "OpportunityApproval_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "OpportunitySite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViabilityScenario" ADD CONSTRAINT "ViabilityScenario_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A business case belongs to exactly one opportunity or project; a
-- milestone to at least one (it keeps its opportunity after conversion).
ALTER TABLE "ViabilityScenario" ADD CONSTRAINT "ViabilityScenario_exactly_one_owner_check"
  CHECK (("projectId" IS NOT NULL) <> ("opportunityId" IS NOT NULL));
ALTER TABLE "DevelopmentMilestone" ADD CONSTRAINT "DevelopmentMilestone_has_owner_check"
  CHECK ("projectId" IS NOT NULL OR "opportunityId" IS NOT NULL);

-- The opportunity form labelled `description` "Need & desirability", so
-- existing text moves into the new PROCSA 0.1 field.
UPDATE "Opportunity" SET "needAndDesirability" = "description" WHERE "needAndDesirability" IS NULL AND "description" IS NOT NULL;
