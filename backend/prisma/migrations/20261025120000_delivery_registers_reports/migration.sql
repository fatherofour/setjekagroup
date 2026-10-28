-- CreateEnum
CREATE TYPE "ReportKind" AS ENUM ('PROGRESS_PPTX', 'SUMMARY_PDF', 'EXCEL_EXPORT', 'CLOSEOUT_PDF');

-- CreateTable
CREATE TABLE "ProjectRegisterEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "register" TEXT NOT NULL,
    "title" TEXT,
    "category" TEXT,
    "status" TEXT,
    "reference" TEXT,
    "location" TEXT,
    "partyName" TEXT,
    "contractorId" TEXT,
    "responsibleId" TEXT,
    "documentId" TEXT,
    "amount" DOUBLE PRECISION,
    "amount2" DOUBLE PRECISION,
    "currency" "Currency",
    "days" INTEGER,
    "date" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRegisterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ReportKind" NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "clientVisible" BOOLEAN NOT NULL DEFAULT false,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectRegisterEntry_projectId_register_idx" ON "ProjectRegisterEntry"("projectId", "register");

-- CreateIndex
CREATE INDEX "ProjectReport_projectId_idx" ON "ProjectReport"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectRegisterEntry" ADD CONSTRAINT "ProjectRegisterEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRegisterEntry" ADD CONSTRAINT "ProjectRegisterEntry_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRegisterEntry" ADD CONSTRAINT "ProjectRegisterEntry_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "ProjectMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRegisterEntry" ADD CONSTRAINT "ProjectRegisterEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRegisterEntry" ADD CONSTRAINT "ProjectRegisterEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReport" ADD CONSTRAINT "ProjectReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReport" ADD CONSTRAINT "ProjectReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
