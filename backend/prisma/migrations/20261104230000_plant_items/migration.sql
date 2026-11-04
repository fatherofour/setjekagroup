-- CreateEnum
CREATE TYPE "PlantCategory" AS ENUM ('EARTHMOVING', 'LIFTING', 'ACCESS', 'CONCRETE', 'COMPACTION', 'TRANSPORT', 'POWER', 'SMALL_PLANT', 'OTHER');

-- CreateEnum
CREATE TYPE "PlantStatus" AS ENUM ('WORKING', 'STANDING', 'BROKEN_DOWN', 'OFF_SITE');

-- CreateEnum
CREATE TYPE "PlantOwnership" AS ENUM ('OWNED', 'HIRED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'PLANT_ITEM';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PLANT_OUT_OF_USE';

-- CreateTable
CREATE TABLE "PlantItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "PlantCategory" NOT NULL,
    "fleetNumber" TEXT,
    "ownership" "PlantOwnership" NOT NULL DEFAULT 'HIRED',
    "supplier" TEXT,
    "contractorId" TEXT,
    "operator" TEXT,
    "operatorCertExpiry" DATE,
    "arrivedOn" DATE NOT NULL,
    "offHireDue" DATE,
    "departedOn" DATE,
    "status" "PlantStatus" NOT NULL DEFAULT 'WORKING',
    "outOfUse" BOOLEAN NOT NULL DEFAULT false,
    "inspectionIntervalDays" INTEGER,
    "lastInspectedOn" DATE,
    "nextInspectionDue" DATE,
    "certificateExpiry" DATE,
    "history" JSONB NOT NULL DEFAULT '[]',
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlantItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlantItem_projectId_status_idx" ON "PlantItem"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlantItem_projectId_sequence_key" ON "PlantItem"("projectId", "sequence");

-- AddForeignKey
ALTER TABLE "PlantItem" ADD CONSTRAINT "PlantItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantItem" ADD CONSTRAINT "PlantItem_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlantItem" ADD CONSTRAINT "PlantItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

