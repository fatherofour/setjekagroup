-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'DONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommentEntityType" ADD VALUE 'PROJECT';
ALTER TYPE "CommentEntityType" ADD VALUE 'OPPORTUNITY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'NOTE_FOR_YOU';
ALTER TYPE "NotificationType" ADD VALUE 'ACTION_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'ACTION_COMPLETED';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "actionStatus" "ActionStatus",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "completedById" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "isAction" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opportunityId" TEXT,
ADD COLUMN     "priority" "SchedulePriority",
ADD COLUMN     "recipientId" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "link" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Comment_opportunityId_idx" ON "Comment"("opportunityId");

-- CreateIndex
CREATE INDEX "Comment_recipientId_idx" ON "Comment"("recipientId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A note belongs to exactly one project or one opportunity.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_has_owner_check" CHECK (("projectId" IS NOT NULL) <> ("opportunityId" IS NOT NULL));
