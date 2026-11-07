-- AlterEnum
ALTER TYPE "StageTransitionStatus" ADD VALUE 'ADVANCED_BY_SETJEKA';
ALTER TYPE "ApprovalSubject" ADD VALUE 'PROJECT_COMPLETION';
ALTER TYPE "NotificationType" ADD VALUE 'STAGE_ADVANCED_BY_SETJEKA';
ALTER TYPE "NotificationType" ADD VALUE 'COMPLETION_CERTIFICATE_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'COMPLETION_CERTIFICATE_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_CLOSED';

-- CreateEnum
CREATE TYPE "ProjectClosure" AS ENUM ('COMPLETED', 'ABANDONED');
CREATE TYPE "ProjectCompletionStatus" AS ENUM ('PENDING', 'SIGNED', 'REJECTED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "StageTransition" ADD COLUMN "overriddenById" TEXT,
ADD COLUMN "overriddenByName" TEXT,
ADD COLUMN "overrideReason" TEXT,
ADD COLUMN "overriddenAt" TIMESTAMP(3);

ALTER TABLE "ApprovalRecord" ADD COLUMN "signedName" TEXT;

ALTER TABLE "Project" ADD COLUMN "closureType" "ProjectClosure",
ADD COLUMN "closureReason" TEXT,
ADD COLUMN "closedAt" TIMESTAMP(3),
ADD COLUMN "closedByName" TEXT;

-- CreateTable
CREATE TABLE "ProjectCompletion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProjectCompletionStatus" NOT NULL DEFAULT 'PENDING',
    "completionDate" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "issuedById" TEXT NOT NULL,
    "issuedByName" TEXT NOT NULL,
    "decisionOutcome" "ApprovalOutcome",
    "decisionComment" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCompletion_projectId_idx" ON "ProjectCompletion"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectCompletion" ADD CONSTRAINT "ProjectCompletion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
