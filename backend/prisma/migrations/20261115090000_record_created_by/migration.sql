-- Who added each task, issue, RFI and submittal (critique V3-H-01).
ALTER TABLE "ProjectTask" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "ProjectIssue" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Rfi" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Submittal" ADD COLUMN "createdByUserId" TEXT;
