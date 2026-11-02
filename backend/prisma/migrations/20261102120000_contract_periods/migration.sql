-- Contractual time periods per contract, and the due dates they set on valuations.
ALTER TABLE "ProjectContract" ADD COLUMN "certifyWithinDays" INTEGER;
ALTER TABLE "ProjectContract" ADD COLUMN "payWithinDays" INTEGER;
ALTER TABLE "Valuation" ADD COLUMN "certifyDueAt" TIMESTAMP(3);
ALTER TABLE "Valuation" ADD COLUMN "payDueAt" TIMESTAMP(3);
