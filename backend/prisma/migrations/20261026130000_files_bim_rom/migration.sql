-- CreateEnum
CREATE TYPE "PunchStatus" AS ENUM ('OPEN', 'READY_FOR_INSPECTION', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClashStatus" AS ENUM ('NEW', 'ACTIVE', 'RESOLVED', 'APPROVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CommentEntityType" ADD VALUE 'PUNCH_ITEM';
ALTER TYPE "CommentEntityType" ADD VALUE 'CLASH';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MarkupKind" ADD VALUE 'STAMP';
ALTER TYPE "MarkupKind" ADD VALUE 'MEASURE';
ALTER TYPE "MarkupKind" ADD VALUE 'AREA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PUNCH_ITEM_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'PUNCH_ITEM_READY';
ALTER TYPE "NotificationType" ADD VALUE 'PUNCH_ITEM_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE 'TEXT_EXTRACTED';

-- AlterTable
ALTER TABLE "DocumentRevision" ADD COLUMN     "textStatus" TEXT;

-- AlterTable
ALTER TABLE "ProjectDocument" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "ProjectIssue" ADD COLUMN     "bcfGuid" TEXT;

-- AlterTable
ALTER TABLE "SitePhoto" ADD COLUMN     "punchItemId" TEXT;

-- CreateTable
CREATE TABLE "DocumentTag" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTagLink" (
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "DocumentTagLink_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateTable
CREATE TABLE "DocumentPageText" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "DocumentPageText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionList" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionListMember" (
    "listId" TEXT NOT NULL,
    "projectMemberId" TEXT NOT NULL,

    CONSTRAINT "DistributionListMember_pkey" PRIMARY KEY ("listId","projectMemberId")
);

-- CreateTable
CREATE TABLE "DrawingCalibration" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "x1" DOUBLE PRECISION NOT NULL,
    "y1" DOUBLE PRECISION NOT NULL,
    "x2" DOUBLE PRECISION NOT NULL,
    "y2" DOUBLE PRECISION NOT NULL,
    "realLength" DOUBLE PRECISION NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawingCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "location" TEXT,
    "priority" "SchedulePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "PunchStatus" NOT NULL DEFAULT 'OPEN',
    "documentId" TEXT,
    "revisionId" TEXT,
    "page" INTEGER,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "assigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "raisedById" TEXT NOT NULL,
    "readyAt" TIMESTAMP(3),
    "readyNote" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "rejectedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PunchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BimProcessing" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "elementCount" INTEGER NOT NULL DEFAULT 0,
    "storeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "schema" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BimProcessing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BimElement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "expressId" INTEGER NOT NULL,
    "globalId" TEXT NOT NULL,
    "ifcType" TEXT NOT NULL,
    "name" TEXT,
    "typeName" TEXT,
    "storey" TEXT,
    "material" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "quantities" JSONB NOT NULL DEFAULT '{}',
    "minX" DOUBLE PRECISION,
    "minY" DOUBLE PRECISION,
    "minZ" DOUBLE PRECISION,
    "maxX" DOUBLE PRECISION,
    "maxY" DOUBLE PRECISION,
    "maxZ" DOUBLE PRECISION,
    "propsHash" TEXT NOT NULL,

    CONSTRAINT "BimElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BimFederation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentIds" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BimFederation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClashTest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "selectionA" JSONB NOT NULL,
    "selectionB" JSONB NOT NULL,
    "tolerance" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "lastRunAt" TIMESTAMP(3),
    "lastRunMs" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClashTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clash" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "aDocumentId" TEXT NOT NULL,
    "aGlobalId" TEXT NOT NULL,
    "aName" TEXT,
    "aType" TEXT NOT NULL,
    "bDocumentId" TEXT NOT NULL,
    "bGlobalId" TEXT NOT NULL,
    "bName" TEXT,
    "bType" TEXT NOT NULL,
    "centre" JSONB NOT NULL,
    "overlap" DOUBLE PRECISION NOT NULL,
    "status" "ClashStatus" NOT NULL DEFAULT 'NEW',
    "issueId" TEXT,
    "note" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Clash_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmartView" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BimRequirementSet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT,
    "requirements" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BimRequirementSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BimRequirementCheck" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BimRequirementCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomRate" (
    "id" TEXT NOT NULL,
    "buildingType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "ratePerM2" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ZAR',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomRegionFactor" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RomRegionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RomEstimate" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "opportunityId" TEXT,
    "name" TEXT NOT NULL,
    "buildingType" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "gfa" DOUBLE PRECISION NOT NULL,
    "baseRate" DOUBLE PRECISION NOT NULL,
    "regionFactor" DOUBLE PRECISION NOT NULL,
    "escalationPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "total" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'ZAR',
    "breakdown" JSONB NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RomEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTag_projectId_name_key" ON "DocumentTag"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPageText_revisionId_page_key" ON "DocumentPageText"("revisionId", "page");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionList_projectId_name_key" ON "DistributionList"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DrawingCalibration_revisionId_page_key" ON "DrawingCalibration"("revisionId", "page");

-- CreateIndex
CREATE INDEX "PunchItem_projectId_status_idx" ON "PunchItem"("projectId", "status");

-- CreateIndex
CREATE INDEX "PunchItem_revisionId_idx" ON "PunchItem"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "PunchItem_projectId_sequence_key" ON "PunchItem"("projectId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "BimProcessing_revisionId_key" ON "BimProcessing"("revisionId");

-- CreateIndex
CREATE INDEX "BimElement_revisionId_ifcType_idx" ON "BimElement"("revisionId", "ifcType");

-- CreateIndex
CREATE INDEX "BimElement_projectId_idx" ON "BimElement"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BimElement_revisionId_globalId_key" ON "BimElement"("revisionId", "globalId");

-- CreateIndex
CREATE UNIQUE INDEX "BimFederation_projectId_name_key" ON "BimFederation"("projectId", "name");

-- CreateIndex
CREATE INDEX "Clash_projectId_status_idx" ON "Clash"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Clash_testId_key_key" ON "Clash"("testId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SmartView_projectId_name_key" ON "SmartView"("projectId", "name");

-- CreateIndex
CREATE INDEX "BimRequirementCheck_setId_ranAt_idx" ON "BimRequirementCheck"("setId", "ranAt");

-- CreateIndex
CREATE UNIQUE INDEX "RomRate_buildingType_quality_key" ON "RomRate"("buildingType", "quality");

-- CreateIndex
CREATE UNIQUE INDEX "RomRegionFactor_region_key" ON "RomRegionFactor"("region");

-- AddForeignKey
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_punchItemId_fkey" FOREIGN KEY ("punchItemId") REFERENCES "PunchItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTagLink" ADD CONSTRAINT "DocumentTagLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTagLink" ADD CONSTRAINT "DocumentTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "DocumentTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPageText" ADD CONSTRAINT "DocumentPageText_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionList" ADD CONSTRAINT "DistributionList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionList" ADD CONSTRAINT "DistributionList_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionListMember" ADD CONSTRAINT "DistributionListMember_listId_fkey" FOREIGN KEY ("listId") REFERENCES "DistributionList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionListMember" ADD CONSTRAINT "DistributionListMember_projectMemberId_fkey" FOREIGN KEY ("projectMemberId") REFERENCES "ProjectMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingCalibration" ADD CONSTRAINT "DrawingCalibration_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingCalibration" ADD CONSTRAINT "DrawingCalibration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PunchItem" ADD CONSTRAINT "PunchItem_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimProcessing" ADD CONSTRAINT "BimProcessing_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimElement" ADD CONSTRAINT "BimElement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimElement" ADD CONSTRAINT "BimElement_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimFederation" ADD CONSTRAINT "BimFederation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimFederation" ADD CONSTRAINT "BimFederation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClashTest" ADD CONSTRAINT "ClashTest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClashTest" ADD CONSTRAINT "ClashTest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clash" ADD CONSTRAINT "Clash_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ClashTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartView" ADD CONSTRAINT "SmartView_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmartView" ADD CONSTRAINT "SmartView_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimRequirementSet" ADD CONSTRAINT "BimRequirementSet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimRequirementSet" ADD CONSTRAINT "BimRequirementSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimRequirementCheck" ADD CONSTRAINT "BimRequirementCheck_setId_fkey" FOREIGN KEY ("setId") REFERENCES "BimRequirementSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BimRequirementCheck" ADD CONSTRAINT "BimRequirementCheck_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomRate" ADD CONSTRAINT "RomRate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomEstimate" ADD CONSTRAINT "RomEstimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomEstimate" ADD CONSTRAINT "RomEstimate_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RomEstimate" ADD CONSTRAINT "RomEstimate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
