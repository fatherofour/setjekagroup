-- The Opportunity client text columns are carried into the new Client
-- directory (below, after "Client" exists) before they're dropped, so no
-- existing opportunity loses its client.

-- CreateEnum
CREATE TYPE "OpportunitySiteStatus" AS ENUM ('CANDIDATE', 'SHORTLISTED', 'SELECTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "Rfq" ADD COLUMN     "currency" "Currency",
ADD COLUMN     "discipline" TEXT,
ADD COLUMN     "opportunityId" TEXT,
ADD COLUMN     "priceWeight" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "ratingWeight" INTEGER NOT NULL DEFAULT 40,
ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_exactly_one_owner_check"
  CHECK (("projectId" IS NOT NULL) <> ("opportunityId" IS NOT NULL));

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "contractorId" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunitySite" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "erfNumber" TEXT,
    "sizeSqm" DOUBLE PRECISION,
    "zoning" TEXT,
    "ownership" TEXT,
    "askingPrice" DOUBLE PRECISION,
    "currency" "Currency",
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "OpportunitySiteStatus" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunitySite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityAppointment" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "rfqId" TEXT,
    "quoteId" TEXT,
    "role" "OrganisationProjectRole" NOT NULL,
    "discipline" TEXT,
    "contractValue" DOUBLE PRECISION,
    "currency" "Currency",
    "rankAtAward" INTEGER,
    "scoreAtAward" DOUBLE PRECISION,
    "justification" TEXT,
    "appointedById" TEXT NOT NULL,
    "projectAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- Data: one Client per distinct existing client name (first opportunity's
-- contact details win), link each opportunity, then drop the old columns.
INSERT INTO "Client" ("id", "name", "contactName", "email", "phone", "createdById", "createdAt", "updatedAt")
SELECT DISTINCT ON (btrim(o."clientName"))
  gen_random_uuid()::text, btrim(o."clientName"), o."clientContactName", o."clientEmail", o."clientPhone",
  o."createdById", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Opportunity" o
WHERE o."clientName" IS NOT NULL AND btrim(o."clientName") <> ''
ORDER BY btrim(o."clientName"), o."createdAt";

UPDATE "Opportunity" o SET "clientId" = c."id"
FROM "Client" c
WHERE c."name" = btrim(o."clientName");

ALTER TABLE "Opportunity" DROP COLUMN "clientContactName",
DROP COLUMN "clientEmail",
DROP COLUMN "clientName",
DROP COLUMN "clientPhone";

-- CreateIndex
CREATE INDEX "OpportunitySite_opportunityId_idx" ON "OpportunitySite"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityAppointment_projectAppointmentId_key" ON "OpportunityAppointment"("projectAppointmentId");

-- CreateIndex
CREATE INDEX "OpportunityAppointment_opportunityId_idx" ON "OpportunityAppointment"("opportunityId");

-- CreateIndex
CREATE INDEX "OpportunityAppointment_contractorId_idx" ON "OpportunityAppointment"("contractorId");

-- CreateIndex
CREATE INDEX "Opportunity_clientId_idx" ON "Opportunity"("clientId");

-- CreateIndex
CREATE INDEX "Rfq_opportunityId_idx" ON "Rfq"("opportunityId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunitySite" ADD CONSTRAINT "OpportunitySite_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAppointment" ADD CONSTRAINT "OpportunityAppointment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAppointment" ADD CONSTRAINT "OpportunityAppointment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAppointment" ADD CONSTRAINT "OpportunityAppointment_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAppointment" ADD CONSTRAINT "OpportunityAppointment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityAppointment" ADD CONSTRAINT "OpportunityAppointment_appointedById_fkey" FOREIGN KEY ("appointedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
