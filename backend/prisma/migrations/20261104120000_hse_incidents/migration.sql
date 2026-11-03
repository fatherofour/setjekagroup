-- CreateEnum
CREATE TYPE "IncidentKind" AS ENUM ('INJURY', 'PROPERTY_DAMAGE', 'ENVIRONMENTAL', 'FIRE', 'DANGEROUS_OCCURRENCE', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('NO_INJURY', 'FIRST_AID', 'MEDICAL_TREATMENT', 'LOST_TIME', 'FATALITY');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('REPORTED', 'INVESTIGATING', 'ACTIONS_OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'HSE_INCIDENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'INCIDENT_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE 'INCIDENT_ACTION_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'INCIDENT_UPDATED';

-- AlterTable
ALTER TABLE "SitePhoto" ADD COLUMN     "hseIncidentId" TEXT;

-- CreateTable
CREATE TABLE "HseIncident" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "IncidentKind" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "immediateAction" TEXT,
    "personsInvolved" TEXT,
    "contractorId" TEXT,
    "lostDays" INTEGER,
    "status" "IncidentStatus" NOT NULL DEFAULT 'REPORTED',
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "reportedToDelAt" TIMESTAMP(3),
    "delReference" TEXT,
    "rootCause" TEXT,
    "investigationNotes" TEXT,
    "investigatedAt" TIMESTAMP(3),
    "reportedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HseIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HseIncident_projectId_status_idx" ON "HseIncident"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HseIncident_projectId_sequence_key" ON "HseIncident"("projectId", "sequence");

-- CreateIndex
CREATE INDEX "IncidentAction_incidentId_idx" ON "IncidentAction"("incidentId");

-- AddForeignKey
ALTER TABLE "SitePhoto" ADD CONSTRAINT "SitePhoto_hseIncidentId_fkey" FOREIGN KEY ("hseIncidentId") REFERENCES "HseIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseIncident" ADD CONSTRAINT "HseIncident_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseIncident" ADD CONSTRAINT "HseIncident_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseIncident" ADD CONSTRAINT "HseIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HseIncident" ADD CONSTRAINT "HseIncident_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "HseIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentAction" ADD CONSTRAINT "IncidentAction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

