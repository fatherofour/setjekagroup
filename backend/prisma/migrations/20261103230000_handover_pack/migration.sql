-- CreateEnum
CREATE TYPE "HandoverKind" AS ENUM ('AS_BUILT', 'O_AND_M_MANUAL', 'WARRANTY', 'GUARANTEE', 'STATUTORY_CERTIFICATE', 'COMMISSIONING', 'HEALTH_AND_SAFETY_FILE', 'OTHER');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('OUTSTANDING', 'SUBMITTED', 'RETURNED', 'ACCEPTED', 'HANDED_OVER');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'HANDOVER_ITEM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'HANDOVER_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'HANDOVER_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'HANDOVER_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'HANDOVER_DELIVERED';

-- CreateTable
CREATE TABLE "HandoverItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "kind" "HandoverKind" NOT NULL,
    "title" TEXT NOT NULL,
    "system" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "HandoverStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "issuer" TEXT,
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "handedOverAt" TIMESTAMP(3),
    "registerEntryId" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandoverFile" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HandoverFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HandoverItem_contractId_status_idx" ON "HandoverItem"("contractId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HandoverItem_projectId_sequence_key" ON "HandoverItem"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "HandoverFile_itemId_idx" ON "HandoverFile"("itemId");

-- AddForeignKey
ALTER TABLE "HandoverItem" ADD CONSTRAINT "HandoverItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverItem" ADD CONSTRAINT "HandoverItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverItem" ADD CONSTRAINT "HandoverItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverFile" ADD CONSTRAINT "HandoverFile_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HandoverItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandoverFile" ADD CONSTRAINT "HandoverFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

