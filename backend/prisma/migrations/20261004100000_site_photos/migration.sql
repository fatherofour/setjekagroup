-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'SITE_PHOTO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PHOTO_ADDED';
ALTER TYPE "NotificationType" ADD VALUE 'PHOTOS_SHARED';

-- AlterEnum
ALTER TYPE "PermissionModule" ADD VALUE 'SITE_PHOTOS';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mutedAlertCategories" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "SitePhoto" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "thumbFilename" TEXT,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationNote" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "projectNodeId" TEXT,
    "scheduleActivityId" TEXT,
    "taskId" TEXT,
    "issueId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SitePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SitePhoto_projectId_takenAt_idx" ON "SitePhoto"("projectId", "takenAt");

-- CreateIndex
CREATE INDEX "SitePhoto_issueId_idx" ON "SitePhoto"("issueId");

-- CreateIndex
CREATE INDEX "SitePhoto_taskId_idx" ON "SitePhoto"("taskId");

-- CreateIndex
CREATE INDEX "SitePhoto_scheduleActivityId_idx" ON "SitePhoto"("scheduleActivityId");

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_projectNodeId_fkey" FOREIGN KEY ("projectNodeId") REFERENCES "ProjectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_scheduleActivityId_fkey" FOREIGN KEY ("scheduleActivityId") REFERENCES "ScheduleActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ProjectIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
