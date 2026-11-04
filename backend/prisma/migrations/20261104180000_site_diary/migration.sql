-- CreateEnum
CREATE TYPE "DiaryStatus" AS ENUM ('DRAFT', 'SIGNED');

-- AlterEnum
ALTER TYPE "CommentEntityType" ADD VALUE 'SITE_DIARY';

-- CreateTable
CREATE TABLE "SiteDiary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "workingHours" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "weatherNote" TEXT,
    "labour" JSONB NOT NULL DEFAULT '[]',
    "plant" JSONB NOT NULL DEFAULT '[]',
    "visitors" TEXT,
    "deliveries" TEXT,
    "delays" TEXT,
    "instructions" TEXT,
    "safety" TEXT,
    "notes" TEXT,
    "status" "DiaryStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDiary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteDiary_projectId_date_key" ON "SiteDiary"("projectId", "date");

-- AddForeignKey
ALTER TABLE "SiteDiary" ADD CONSTRAINT "SiteDiary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDiary" ADD CONSTRAINT "SiteDiary_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDiary" ADD CONSTRAINT "SiteDiary_signedById_fkey" FOREIGN KEY ("signedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

