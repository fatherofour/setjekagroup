-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'ZAR');

-- CreateEnum
CREATE TYPE "ClassificationStandard" AS ENUM ('ASAQS', 'NRM');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "classificationStandard" "ClassificationStandard" NOT NULL DEFAULT 'ASAQS',
ADD COLUMN     "contingencyPct" DOUBLE PRECISION DEFAULT 25,
ADD COLUMN     "currency" "Currency" NOT NULL DEFAULT 'ZAR',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "projectCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");

