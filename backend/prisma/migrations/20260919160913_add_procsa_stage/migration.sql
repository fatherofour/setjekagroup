-- CreateEnum
CREATE TYPE "ProcsaStage" AS ENUM ('STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4', 'STAGE_5', 'STAGE_6');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "procsaStage" "ProcsaStage" NOT NULL DEFAULT 'STAGE_1';
