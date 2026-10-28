-- CreateEnum
CREATE TYPE "ApprovalOutcome" AS ENUM ('APPROVED', 'APPROVED_WITH_COMMENTS', 'REJECTED', 'REJECTED_WITH_COMMENTS');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('ACCEPTED', 'DRAWN', 'TYPED', 'UPLOADED');

-- CreateEnum
CREATE TYPE "ApprovalSubject" AS ENUM ('STAGE_DELIVERABLE', 'VARIATION', 'STAGE_TRANSITION', 'DOCUMENT_REVISION');

-- CreateEnum
CREATE TYPE "DocumentApprovalStatus" AS ENUM ('PENDING', 'DECIDED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_APPROVAL_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'DOCUMENT_APPROVAL_DECIDED';

-- AlterTable
ALTER TABLE "StageDeliverable" ADD COLUMN     "decisionOutcome" "ApprovalOutcome",
ADD COLUMN     "responseDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StageTransition" ADD COLUMN     "decisionOutcome" "ApprovalOutcome",
ADD COLUMN     "responseDueAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Variation" ADD COLUMN     "decisionOutcome" "ApprovalOutcome",
ADD COLUMN     "responseDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subject" "ApprovalSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcome" "ApprovalOutcome" NOT NULL,
    "comment" TEXT,
    "method" "SignatureMethod" NOT NULL,
    "signatureFilename" TEXT,
    "signerId" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerRole" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedFilename" TEXT,
    "signedSha256" TEXT,

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSignature" (
    "userId" TEXT NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "filename" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSignature_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DocumentApprovalRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "message" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "status" "DocumentApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "outcome" "ApprovalOutcome",
    "comment" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRecord_projectId_idx" ON "ApprovalRecord"("projectId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_subject_subjectId_idx" ON "ApprovalRecord"("subject", "subjectId");

-- CreateIndex
CREATE INDEX "DocumentApprovalRequest_projectId_idx" ON "DocumentApprovalRequest"("projectId");

-- CreateIndex
CREATE INDEX "DocumentApprovalRequest_revisionId_idx" ON "DocumentApprovalRequest"("revisionId");

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSignature" ADD CONSTRAINT "UserSignature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentApprovalRequest" ADD CONSTRAINT "DocumentApprovalRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Decisions made before the four responses existed.
UPDATE "StageDeliverable" SET "decisionOutcome" = 'APPROVED' WHERE "status" = 'APPROVED' AND "decisionOutcome" IS NULL;
UPDATE "StageDeliverable" SET "decisionOutcome" = 'REJECTED_WITH_COMMENTS' WHERE "status" = 'REVISION_REQUESTED' AND "decisionOutcome" IS NULL;
UPDATE "Variation" SET "decisionOutcome" = 'APPROVED' WHERE "status" = 'APPROVED' AND "decisionOutcome" IS NULL;
UPDATE "Variation" SET "decisionOutcome" = 'REJECTED_WITH_COMMENTS' WHERE "status" = 'REJECTED' AND "decisionOutcome" IS NULL;
UPDATE "StageTransition" SET "decisionOutcome" = 'APPROVED' WHERE "status" = 'APPROVED' AND "decisionOutcome" IS NULL;
UPDATE "StageTransition" SET "decisionOutcome" = CASE WHEN "decisionComment" IS NULL OR "decisionComment" = '' THEN 'REJECTED'::"ApprovalOutcome" ELSE 'REJECTED_WITH_COMMENTS'::"ApprovalOutcome" END WHERE "status" = 'REJECTED' AND "decisionOutcome" IS NULL;
