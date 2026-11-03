-- CreateEnum
CREATE TYPE "DefectList" AS ENUM ('PRACTICAL_COMPLETION', 'DEFECTS_LIABILITY', 'LATENT');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('REPORTED', 'OPEN', 'RECTIFIED', 'VERIFIED', 'DECLINED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'CONTRACT_DEFECT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'COMPLETION_CERTIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'DEFECT_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE 'DEFECT_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE 'DEFECT_RECTIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'DEFECT_DECIDED';

-- AlterTable
ALTER TABLE "ProjectContract" ADD COLUMN     "defectsPeriodDays" INTEGER,
ADD COLUMN     "defectsPeriodEndsAt" TIMESTAMP(3),
ADD COLUMN     "finalCompletionAt" TIMESTAMP(3),
ADD COLUMN     "practicalCompletionAt" TIMESTAMP(3),
ADD COLUMN     "worksCompletionAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SitePhoto" ADD COLUMN     "contractDefectId" TEXT;

-- CreateTable
CREATE TABLE "ContractDefect" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "list" "DefectList" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "status" "DefectStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "raisedById" TEXT NOT NULL,
    "rectifiedAt" TIMESTAMP(3),
    "rectifiedNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "declineReason" TEXT,
    "reopened" INTEGER NOT NULL DEFAULT 0,
    "registerEntryId" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractDefect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractDefect_contractId_status_idx" ON "ContractDefect"("contractId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractDefect_projectId_sequence_key" ON "ContractDefect"("projectId", "sequence");

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_contractDefectId_fkey" FOREIGN KEY ("contractDefectId") REFERENCES "ContractDefect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDefect" ADD CONSTRAINT "ContractDefect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDefect" ADD CONSTRAINT "ContractDefect_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDefect" ADD CONSTRAINT "ContractDefect_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractDefect" ADD CONSTRAINT "ContractDefect_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

