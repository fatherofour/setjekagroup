-- CreateEnum
CREATE TYPE "OrganisationClassification" AS ENUM ('CONTRACTOR', 'CONSULTANT', 'SUPPLIER', 'SUBCONTRACTOR', 'SERVICE_PROVIDER', 'MANUFACTURER', 'SPECIALIST_CONTRACTOR', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganisationRegistrationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OrganisationPrequalificationStatus" AS ENUM ('NOT_ASSESSED', 'SUBMITTED', 'UNDER_REVIEW', 'PREQUALIFIED', 'CONDITIONALLY_PREQUALIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ComplianceVerificationStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrganisationProjectRole" AS ENUM ('CLIENT', 'DEVELOPMENT_MANAGER', 'PROJECT_MANAGER', 'ARCHITECT', 'QUANTITY_SURVEYOR', 'CIVIL_ENGINEER', 'STRUCTURAL_ENGINEER', 'MAIN_CONTRACTOR', 'SUBCONTRACTOR', 'SUPPLIER', 'CONSULTANT', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganisationAppointmentStatus" AS ENUM ('PROPOSED', 'APPOINTED', 'ACTIVE', 'COMPLETED', 'TERMINATED');

-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "city" TEXT,
ADD COLUMN     "classifications" "OrganisationClassification"[] DEFAULT ARRAY[]::"OrganisationClassification"[],
ADD COLUMN     "country" TEXT,
ADD COLUMN     "disciplines" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "prequalificationStatus" "OrganisationPrequalificationStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "registrationStatus" "OrganisationRegistrationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "stateProvince" TEXT,
ADD COLUMN     "taxVatNumber" TEXT,
ADD COLUMN     "tradingName" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "yearEstablished" INTEGER;

-- CreateTable
CREATE TABLE "OrganisationContact" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "contactType" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canReceiveRfqs" BOOLEAN NOT NULL DEFAULT false,
    "canReceiveCorrespondence" BOOLEAN NOT NULL DEFAULT false,
    "canReceivePaymentNotifications" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRecord" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issuingAuthority" TEXT,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "verificationStatus" "ComplianceVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationProjectAppointment" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "OrganisationProjectRole" NOT NULL,
    "appointmentType" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "appointmentReference" TEXT,
    "contractReference" TEXT,
    "contractValue" DOUBLE PRECISION,
    "currency" "Currency",
    "scopeOfWork" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "appointmentStatus" "OrganisationAppointmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationProjectAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationStatusHistory" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "comment" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganisationStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganisationContact_contractorId_idx" ON "OrganisationContact"("contractorId");

-- CreateIndex
CREATE INDEX "ComplianceRecord_contractorId_idx" ON "ComplianceRecord"("contractorId");

-- CreateIndex
CREATE INDEX "ComplianceRecord_expiryDate_idx" ON "ComplianceRecord"("expiryDate");

-- CreateIndex
CREATE INDEX "OrganisationProjectAppointment_contractorId_idx" ON "OrganisationProjectAppointment"("contractorId");

-- CreateIndex
CREATE INDEX "OrganisationProjectAppointment_projectId_idx" ON "OrganisationProjectAppointment"("projectId");

-- CreateIndex
CREATE INDEX "OrganisationStatusHistory_contractorId_idx" ON "OrganisationStatusHistory"("contractorId");

-- CreateIndex
CREATE INDEX "Contractor_registrationNumber_idx" ON "Contractor"("registrationNumber");

-- CreateIndex
CREATE INDEX "Contractor_taxVatNumber_idx" ON "Contractor"("taxVatNumber");

-- AddForeignKey
ALTER TABLE "OrganisationContact" ADD CONSTRAINT "OrganisationContact_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRecord" ADD CONSTRAINT "ComplianceRecord_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRecord" ADD CONSTRAINT "ComplianceRecord_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationProjectAppointment" ADD CONSTRAINT "OrganisationProjectAppointment_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationProjectAppointment" ADD CONSTRAINT "OrganisationProjectAppointment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationStatusHistory" ADD CONSTRAINT "OrganisationStatusHistory_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationStatusHistory" ADD CONSTRAINT "OrganisationStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

