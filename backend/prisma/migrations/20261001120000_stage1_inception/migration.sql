-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('NOT_STARTED', 'DRAFTED', 'ISSUED', 'SIGNED');

-- CreateEnum
CREATE TYPE "ConstraintImpact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SiteConstraintStatus" AS ENUM ('OPEN', 'MITIGATED', 'ACCEPTED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('RECOMMENDED', 'COMMISSIONED', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ViabilityRevenueMode" AS ENUM ('SALE', 'RENTAL');

-- CreateEnum
CREATE TYPE "DeliveryStrategy" AS ENUM ('TRADITIONAL', 'DESIGN_AND_BUILD', 'MANAGEMENT_CONTRACTING', 'CONSTRUCTION_MANAGEMENT', 'TURNKEY', 'OTHER');

-- CreateEnum
CREATE TYPE "TenderMethod" AS ENUM ('OPEN', 'SELECTIVE', 'NEGOTIATED', 'NOMINATED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('NOT_STARTED', 'IN_PREPARATION', 'SUBMITTED', 'APPROVED', 'REJECTED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "InformationStatus" AS ENUM ('REQUIRED', 'REQUESTED', 'RECEIVED', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "AdviceTopic" AS ENUM ('PROCUREMENT_POLICY', 'RIGHTS_CONSTRAINTS_CONSENTS', 'CONSULTANTS_REQUIRED', 'ECONOMIC_FACTORS', 'FINANCIAL_DESIGN_CRITERIA', 'SURVEYS_INVESTIGATIONS', 'GENERAL');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('INITIATION', 'DESIGN', 'CONSULTANTS', 'CLIENT', 'SITE', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REVISION_REQUESTED');

-- CreateEnum
CREATE TYPE "DeliverableEventType" AS ENUM ('SUBMITTED', 'APPROVED', 'REVISION_REQUESTED', 'REOPENED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommentEntityType" ADD VALUE 'STAGE_DELIVERABLE';
ALTER TYPE "CommentEntityType" ADD VALUE 'PROJECT_BRIEF';
ALTER TYPE "CommentEntityType" ADD VALUE 'MEETING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DELIVERABLE_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'DELIVERABLE_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'MEETING_SCHEDULED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrganisationProjectRole" ADD VALUE 'ELECTRICAL_ENGINEER';
ALTER TYPE "OrganisationProjectRole" ADD VALUE 'MECHANICAL_ENGINEER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PermissionModule" ADD VALUE 'PROJECT_DEFINITION';
ALTER TYPE "PermissionModule" ADD VALUE 'MEETINGS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectMemberRole" ADD VALUE 'ARCHITECT';
ALTER TYPE "ProjectMemberRole" ADD VALUE 'STRUCTURAL_ENGINEER';
ALTER TYPE "ProjectMemberRole" ADD VALUE 'CIVIL_ENGINEER';
ALTER TYPE "ProjectMemberRole" ADD VALUE 'ELECTRICAL_ENGINEER';
ALTER TYPE "ProjectMemberRole" ADD VALUE 'MECHANICAL_ENGINEER';

-- AlterTable
ALTER TABLE "OrganisationProjectAppointment" ADD COLUMN     "agreementForm" TEXT,
ADD COLUMN     "agreementSignedAt" TIMESTAMP(3),
ADD COLUMN     "agreementStatus" "AgreementStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "awardJustification" TEXT,
ADD COLUMN     "feeBasis" TEXT,
ADD COLUMN     "feePercentage" DOUBLE PRECISION,
ADD COLUMN     "rankAtAward" INTEGER,
ADD COLUMN     "rolesAndResponsibilities" TEXT,
ADD COLUMN     "scoreAtAward" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProjectTask" ADD COLUMN     "meetingId" TEXT;

-- CreateTable
CREATE TABLE "ProjectBrief" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "clientRequirements" TEXT,
    "userNeeds" TEXT,
    "optionsConsidered" TEXT,
    "objectives" TEXT,
    "priorities" TEXT,
    "constraints" TEXT,
    "assumptions" TEXT,
    "aspirations" TEXT,
    "strategies" TEXT,
    "budgetTarget" DOUBLE PRECISION,
    "targetCompletion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteConstraint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impact" "ConstraintImpact" NOT NULL DEFAULT 'MEDIUM',
    "status" "SiteConstraintStatus" NOT NULL DEFAULT 'OPEN',
    "mitigation" TEXT,
    "raisedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInvestigation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "investigationType" TEXT NOT NULL,
    "description" TEXT,
    "recommendedById" TEXT,
    "responsibleId" TEXT,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'RECOMMENDED',
    "requiredByStage" "ProjectStage" NOT NULL DEFAULT 'CONCEPT',
    "dueDate" TIMESTAMP(3),
    "estimatedCost" DOUBLE PRECISION,
    "findings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInvestigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViabilityScenario" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "landCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gbaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "constructionRatePerSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "professionalFeesPct" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "otherCosts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "financeRatePct" DOUBLE PRECISION NOT NULL DEFAULT 11,
    "financeMonths" INTEGER NOT NULL DEFAULT 24,
    "revenueMode" "ViabilityRevenueMode" NOT NULL DEFAULT 'SALE',
    "sellableAreaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salePricePerSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lettableAreaSqm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rentPerSqmMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vacancyPct" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "capRatePct" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "targetProfitPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "assumptions" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViabilityScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementPolicy" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "deliveryStrategy" "DeliveryStrategy",
    "tenderMethod" "TenderMethod",
    "minimumQuotes" INTEGER NOT NULL DEFAULT 3,
    "priceWeight" INTEGER NOT NULL DEFAULT 60,
    "ratingWeight" INTEGER NOT NULL DEFAULT 40,
    "preferentialProcurement" TEXT,
    "localContentTargetPct" DOUBLE PRECISION,
    "approvalThresholds" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcurementPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentApproval" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authority" TEXT,
    "category" TEXT,
    "responsibleId" TEXT,
    "requiredByStage" "ProjectStage" NOT NULL DEFAULT 'CONCEPT',
    "plannedSubmission" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "status" "ConsentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "reference" TEXT,
    "notes" TEXT,
    "sourceApprovalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformationItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "heldBy" TEXT,
    "responsibleId" TEXT,
    "status" "InformationStatus" NOT NULL DEFAULT 'REQUIRED',
    "dueDate" TIMESTAMP(3),
    "documentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InformationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequiredService" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "notes" TEXT,
    "notRequired" BOOLEAN NOT NULL DEFAULT false,
    "recommendedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequiredService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantAdvice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topic" "AdviceTopic" NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorRole" "ProjectMemberRole",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultantAdvice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingType" "MeetingType" NOT NULL DEFAULT 'OTHER',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "agenda" TEXT,
    "minutes" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "minutesIssuedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "projectMemberId" TEXT NOT NULL,
    "present" BOOLEAN,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageDeliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "key" TEXT NOT NULL,
    "status" "DeliverableStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageDeliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageDeliverableEvent" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "type" "DeliverableEventType" NOT NULL,
    "version" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "comment" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageDeliverableEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponsibilityCheck" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL,
    "roleKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "doneById" TEXT NOT NULL,
    "note" TEXT,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResponsibilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBrief_projectId_key" ON "ProjectBrief"("projectId");

-- CreateIndex
CREATE INDEX "SiteConstraint_projectId_idx" ON "SiteConstraint"("projectId");

-- CreateIndex
CREATE INDEX "SiteInvestigation_projectId_idx" ON "SiteInvestigation"("projectId");

-- CreateIndex
CREATE INDEX "ViabilityScenario_projectId_idx" ON "ViabilityScenario"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementPolicy_projectId_key" ON "ProcurementPolicy"("projectId");

-- CreateIndex
CREATE INDEX "ConsentApproval_projectId_idx" ON "ConsentApproval"("projectId");

-- CreateIndex
CREATE INDEX "InformationItem_projectId_idx" ON "InformationItem"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "RequiredService_projectId_discipline_key" ON "RequiredService"("projectId", "discipline");

-- CreateIndex
CREATE INDEX "ConsultantAdvice_projectId_topic_idx" ON "ConsultantAdvice"("projectId", "topic");

-- CreateIndex
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_meetingId_projectMemberId_key" ON "MeetingAttendee"("meetingId", "projectMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "StageDeliverable_projectId_stage_key_key" ON "StageDeliverable"("projectId", "stage", "key");

-- CreateIndex
CREATE INDEX "StageDeliverableEvent_deliverableId_idx" ON "StageDeliverableEvent"("deliverableId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponsibilityCheck_projectId_stage_roleKey_code_key" ON "ResponsibilityCheck"("projectId", "stage", "roleKey", "code");

-- CreateIndex
CREATE INDEX "ProjectTask_meetingId_idx" ON "ProjectTask"("meetingId");

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBrief" ADD CONSTRAINT "ProjectBrief_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteConstraint" ADD CONSTRAINT "SiteConstraint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteConstraint" ADD CONSTRAINT "SiteConstraint_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInvestigation" ADD CONSTRAINT "SiteInvestigation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInvestigation" ADD CONSTRAINT "SiteInvestigation_recommendedById_fkey" FOREIGN KEY ("recommendedById") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInvestigation" ADD CONSTRAINT "SiteInvestigation_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViabilityScenario" ADD CONSTRAINT "ViabilityScenario_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ViabilityScenario" ADD CONSTRAINT "ViabilityScenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementPolicy" ADD CONSTRAINT "ProcurementPolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentApproval" ADD CONSTRAINT "ConsentApproval_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentApproval" ADD CONSTRAINT "ConsentApproval_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentApproval" ADD CONSTRAINT "ConsentApproval_sourceApprovalId_fkey" FOREIGN KEY ("sourceApprovalId") REFERENCES "OpportunityApproval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationItem" ADD CONSTRAINT "InformationItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationItem" ADD CONSTRAINT "InformationItem_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationItem" ADD CONSTRAINT "InformationItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequiredService" ADD CONSTRAINT "RequiredService_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequiredService" ADD CONSTRAINT "RequiredService_recommendedById_fkey" FOREIGN KEY ("recommendedById") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAdvice" ADD CONSTRAINT "ConsultantAdvice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAdvice" ADD CONSTRAINT "ConsultantAdvice_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDeliverable" ADD CONSTRAINT "StageDeliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDeliverable" ADD CONSTRAINT "StageDeliverable_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDeliverable" ADD CONSTRAINT "StageDeliverable_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDeliverableEvent" ADD CONSTRAINT "StageDeliverableEvent_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "StageDeliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageDeliverableEvent" ADD CONSTRAINT "StageDeliverableEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsibilityCheck" ADD CONSTRAINT "ResponsibilityCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsibilityCheck" ADD CONSTRAINT "ResponsibilityCheck_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
