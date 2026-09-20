-- CreateEnum
CREATE TYPE "ProjectRiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'ESCALATED', 'CLOSED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'RISK';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'RISK_ESCALATED';

-- CreateTable
CREATE TABLE "ProjectRisk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "ownerId" TEXT,
    "mitigation" TEXT,
    "status" "ProjectRiskStatus" NOT NULL DEFAULT 'OPEN',
    "reviewDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRisk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectRisk_projectId_idx" ON "ProjectRisk"("projectId");

-- CreateIndex
CREATE INDEX "ProjectRisk_ownerId_idx" ON "ProjectRisk"("ownerId");

-- AddForeignKey
ALTER TABLE "ProjectRisk" ADD CONSTRAINT "ProjectRisk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRisk" ADD CONSTRAINT "ProjectRisk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

