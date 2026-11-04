-- CreateEnum
CREATE TYPE "Country" AS ENUM ('ZA', 'NG');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "country" "Country" NOT NULL DEFAULT 'ZA';

