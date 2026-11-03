-- AlterTable
ALTER TABLE "ScheduleBaselineSnapshot" ADD COLUMN     "baselineFloatDays" DOUBLE PRECISION,
ADD COLUMN     "baselinePercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "wasCritical" BOOLEAN NOT NULL DEFAULT false;

