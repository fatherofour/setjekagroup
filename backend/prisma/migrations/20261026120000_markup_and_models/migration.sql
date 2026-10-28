-- CreateEnum
CREATE TYPE "MarkupKind" AS ENUM ('PEN', 'RECTANGLE', 'CLOUD', 'ARROW', 'TEXT', 'PIN');

-- CreateTable
CREATE TABLE "DrawingMarkup" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "kind" "MarkupKind" NOT NULL,
    "geometry" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#dc2626',
    "text" TEXT,
    "authorId" TEXT NOT NULL,
    "issueId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingMarkup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelObjectLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "globalId" TEXT NOT NULL,
    "expressId" INTEGER,
    "ifcType" TEXT,
    "name" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "viewpoint" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelObjectLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawingMarkup_revisionId_page_idx" ON "DrawingMarkup"("revisionId", "page");

-- CreateIndex
CREATE INDEX "DrawingMarkup_projectId_idx" ON "DrawingMarkup"("projectId");

-- CreateIndex
CREATE INDEX "ModelObjectLink_projectId_entityType_entityId_idx" ON "ModelObjectLink"("projectId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelObjectLink_documentId_globalId_entityType_entityId_key" ON "ModelObjectLink"("documentId", "globalId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "ProjectIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingMarkup" ADD CONSTRAINT "DrawingMarkup_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelObjectLink" ADD CONSTRAINT "ModelObjectLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelObjectLink" ADD CONSTRAINT "ModelObjectLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ProjectDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelObjectLink" ADD CONSTRAINT "ModelObjectLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
