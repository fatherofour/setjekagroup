-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('IDENTIFIED', 'UNDER_EVALUATION', 'APPROVED', 'ON_HOLD', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "OpportunityApprovalStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "developmentType" TEXT,
    "location" TEXT,
    "estimatedValue" DOUBLE PRECISION,
    "currency" "Currency",
    "clientName" TEXT,
    "clientContactName" TEXT,
    "clientEmail" TEXT,
    "clientPhone" TEXT,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'IDENTIFIED',
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "convertedProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityStageHistory" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "previousStage" TEXT NOT NULL,
    "newStage" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityApproval" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "approvalType" TEXT NOT NULL,
    "status" "OpportunityApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "evidenceNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_convertedProjectId_key" ON "Opportunity"("convertedProjectId");

-- CreateIndex
CREATE INDEX "OpportunityStageHistory_opportunityId_idx" ON "OpportunityStageHistory"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityApproval_opportunityId_idx" ON "OpportunityApproval"("opportunityId");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_convertedProjectId_fkey" FOREIGN KEY ("convertedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityStageHistory" ADD CONSTRAINT "OpportunityStageHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApproval" ADD CONSTRAINT "OpportunityApproval_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityApproval" ADD CONSTRAINT "OpportunityApproval_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

