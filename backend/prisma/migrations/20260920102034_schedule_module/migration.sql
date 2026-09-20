-- CreateEnum
CREATE TYPE "ScheduleActivityType" AS ENUM ('TASK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "SchedulePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScheduleActivityStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'DELAYED');

-- CreateEnum
CREATE TYPE "ScheduleDependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateTable
CREATE TABLE "ScheduleActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "projectNodeId" TEXT,
    "contractorId" TEXT,
    "assignedToId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "activityType" "ScheduleActivityType" NOT NULL DEFAULT 'TASK',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "priority" "SchedulePriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ScheduleActivityStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "earlyStart" TIMESTAMP(3),
    "earlyFinish" TIMESTAMP(3),
    "lateStart" TIMESTAMP(3),
    "lateFinish" TIMESTAMP(3),
    "totalFloatDays" DOUBLE PRECISION,
    "isCriticalPath" BOOLEAN NOT NULL DEFAULT false,
    "importedFromMsProject" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleDependency" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "type" "ScheduleDependencyType" NOT NULL DEFAULT 'FS',
    "lagDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBaseline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBaselineSnapshot" (
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "baselineStart" TIMESTAMP(3) NOT NULL,
    "baselineEnd" TIMESTAMP(3) NOT NULL,
    "baselineDurationDays" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ScheduleBaselineSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleActivity_projectId_idx" ON "ScheduleActivity"("projectId");

-- CreateIndex
CREATE INDEX "ScheduleActivity_parentId_idx" ON "ScheduleActivity"("parentId");

-- CreateIndex
CREATE INDEX "ScheduleActivity_projectNodeId_idx" ON "ScheduleActivity"("projectNodeId");

-- CreateIndex
CREATE INDEX "ScheduleActivity_contractorId_idx" ON "ScheduleActivity"("contractorId");

-- CreateIndex
CREATE INDEX "ScheduleActivity_assignedToId_idx" ON "ScheduleActivity"("assignedToId");

-- CreateIndex
CREATE INDEX "ScheduleDependency_projectId_idx" ON "ScheduleDependency"("projectId");

-- CreateIndex
CREATE INDEX "ScheduleDependency_predecessorId_idx" ON "ScheduleDependency"("predecessorId");

-- CreateIndex
CREATE INDEX "ScheduleDependency_successorId_idx" ON "ScheduleDependency"("successorId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleDependency_predecessorId_successorId_key" ON "ScheduleDependency"("predecessorId", "successorId");

-- CreateIndex
CREATE INDEX "ScheduleBaseline_projectId_idx" ON "ScheduleBaseline"("projectId");

-- CreateIndex
CREATE INDEX "ScheduleBaselineSnapshot_baselineId_idx" ON "ScheduleBaselineSnapshot"("baselineId");

-- CreateIndex
CREATE INDEX "ScheduleBaselineSnapshot_activityId_idx" ON "ScheduleBaselineSnapshot"("activityId");

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_projectNodeId_fkey" FOREIGN KEY ("projectNodeId") REFERENCES "ProjectNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleActivity" ADD CONSTRAINT "ScheduleActivity_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleDependency" ADD CONSTRAINT "ScheduleDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBaseline" ADD CONSTRAINT "ScheduleBaseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBaseline" ADD CONSTRAINT "ScheduleBaseline_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBaselineSnapshot" ADD CONSTRAINT "ScheduleBaselineSnapshot_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "ScheduleBaseline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBaselineSnapshot" ADD CONSTRAINT "ScheduleBaselineSnapshot_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ScheduleActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

