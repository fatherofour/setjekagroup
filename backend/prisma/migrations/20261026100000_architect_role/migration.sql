-- CreateEnum
CREATE TYPE "IssuePurpose" AS ENUM ('FOR_INFORMATION', 'FOR_COMMENT', 'FOR_COORDINATION', 'FOR_CLIENT_APPROVAL', 'FOR_AUTHORITY_SUBMISSION', 'FOR_PROCUREMENT', 'FOR_CONSTRUCTION', 'AS_BUILT');

-- CreateEnum
CREATE TYPE "ConsentEventKind" AS ENUM ('SUBMITTED', 'COMMENTS_RECEIVED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'NOTE');

-- CreateEnum
CREATE TYPE "CommunicationKind" AS ENUM ('CLIENT_REQUEST', 'SETJEKA_INSTRUCTION', 'CONTRACT_INSTRUCTION', 'CORRESPONDENCE');

-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('DRAFT', 'AWAITING_ISSUE', 'ISSUED', 'RESPONDED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionKind" AS ENUM ('QUALITY', 'DESIGN_SUPERVISION', 'TEST_WITNESS', 'MOCK_UP', 'PRACTICAL_COMPLETION', 'DEFECTS_VERIFICATION');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('CONFORMS', 'CONFORMS_WITH_COMMENTS', 'NON_CONFORMING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommentEntityType" ADD VALUE 'COMMUNICATION';
ALTER TYPE "CommentEntityType" ADD VALUE 'INSPECTION';
ALTER TYPE "CommentEntityType" ADD VALUE 'CONSENT';

-- AlterEnum
ALTER TYPE "ConsentStatus" ADD VALUE 'RETURNED_WITH_COMMENTS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COMMUNICATION_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNICATION_AWAITING_ISSUE';
ALTER TYPE "NotificationType" ADD VALUE 'COMMUNICATION_ANSWERED';
ALTER TYPE "NotificationType" ADD VALUE 'INSPECTION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'INSPECTION_SCHEDULED';
ALTER TYPE "NotificationType" ADD VALUE 'INSPECTION_COMPLETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PermissionModule" ADD VALUE 'COMMUNICATIONS';
ALTER TYPE "PermissionModule" ADD VALUE 'INSPECTIONS';

-- AlterTable
ALTER TABLE "ConsentApproval" ADD COLUMN     "expectedDecisionAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DocumentRevision" ADD COLUMN     "purpose" "IssuePurpose",
ADD COLUMN     "revisionDate" TIMESTAMP(3),
ADD COLUMN     "titleBlock" JSONB;

-- AlterTable
ALTER TABLE "ProjectDocument" ADD COLUMN     "drawingKey" TEXT,
ADD COLUMN     "drawingNumber" TEXT,
ADD COLUMN     "drawingNumberSource" TEXT,
ADD COLUMN     "originator" TEXT;

-- AlterTable
ALTER TABLE "ProjectIssue" ADD COLUMN     "inspectionId" TEXT;

-- AlterTable
ALTER TABLE "SitePhoto" ADD COLUMN     "inspectionId" TEXT;

-- AlterTable
ALTER TABLE "Variation" ADD COLUMN     "communicationId" TEXT;

-- CreateTable
CREATE TABLE "PlannedDrawing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "drawingNumber" TEXT,
    "drawingKey" TEXT,
    "title" TEXT NOT NULL,
    "discipline" TEXT,
    "stage" "ProjectStage" NOT NULL,
    "purpose" "IssuePurpose" NOT NULL,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "responsibleId" TEXT,
    "documentId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedDrawing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "kind" "ConsentEventKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "documentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCommunication" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "CommunicationKind" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunicationStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "parentId" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "costImpact" BOOLEAN NOT NULL DEFAULT false,
    "timeImpact" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationRecipient" (
    "id" TEXT NOT NULL,
    "communicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "CommunicationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationDocument" (
    "communicationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "CommunicationDocument_pkey" PRIMARY KEY ("communicationId","documentId")
);

-- CreateTable
CREATE TABLE "InspectionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workType" TEXT,
    "kind" "InspectionKind",
    "items" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInspection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "InspectionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "workType" TEXT,
    "location" TEXT,
    "projectNodeId" TEXT,
    "scheduleActivityId" TEXT,
    "status" "InspectionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "requestedFor" TIMESTAMP(3),
    "inspectorId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "templateId" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "outcome" "InspectionOutcome",
    "summary" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlannedDrawing_projectId_plannedDate_idx" ON "PlannedDrawing"("projectId", "plannedDate");

-- CreateIndex
CREATE INDEX "ConsentEvent_consentId_date_idx" ON "ConsentEvent"("consentId", "date");

-- CreateIndex
CREATE INDEX "ProjectCommunication_projectId_createdAt_idx" ON "ProjectCommunication"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCommunication_projectId_kind_sequence_key" ON "ProjectCommunication"("projectId", "kind", "sequence");

-- CreateIndex
CREATE INDEX "CommunicationRecipient_userId_idx" ON "CommunicationRecipient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRecipient_communicationId_userId_key" ON "CommunicationRecipient"("communicationId", "userId");

-- CreateIndex
CREATE INDEX "SiteInspection_projectId_status_idx" ON "SiteInspection"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInspection_projectId_sequence_key" ON "SiteInspection"("projectId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDocument_projectId_drawingKey_key" ON "ProjectDocument"("projectId", "drawingKey");

-- AddForeignKey
ALTER TABLE "ProjectIssue" ADD CONSTRAINT "ProjectIssue_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SiteInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variation" ADD CONSTRAINT "Variation_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "ProjectCommunication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "SiteInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedDrawing" ADD CONSTRAINT "PlannedDrawing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedDrawing" ADD CONSTRAINT "PlannedDrawing_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedDrawing" ADD CONSTRAINT "PlannedDrawing_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedDrawing" ADD CONSTRAINT "PlannedDrawing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "ConsentApproval"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommunication" ADD CONSTRAINT "ProjectCommunication_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommunication" ADD CONSTRAINT "ProjectCommunication_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommunication" ADD CONSTRAINT "ProjectCommunication_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCommunication" ADD CONSTRAINT "ProjectCommunication_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectCommunication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "ProjectCommunication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationDocument" ADD CONSTRAINT "CommunicationDocument_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "ProjectCommunication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationDocument" ADD CONSTRAINT "CommunicationDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionTemplate" ADD CONSTRAINT "InspectionTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspection" ADD CONSTRAINT "SiteInspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspection" ADD CONSTRAINT "SiteInspection_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspection" ADD CONSTRAINT "SiteInspection_inspectorId_fkey" FOREIGN KEY ("inspectorId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspection" ADD CONSTRAINT "SiteInspection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "InspectionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInspection" ADD CONSTRAINT "SiteInspection_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
