-- CreateEnum
CREATE TYPE "RaterType" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" "Currency" NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "method" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationRating" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "raterType" "RaterType" NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganisationRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentRecord_contractorId_idx" ON "PaymentRecord"("contractorId");

-- CreateIndex
CREATE INDEX "PaymentRecord_appointmentId_idx" ON "PaymentRecord"("appointmentId");

-- CreateIndex
CREATE INDEX "OrganisationRating_contractorId_idx" ON "OrganisationRating"("contractorId");

-- CreateIndex
CREATE INDEX "OrganisationRating_appointmentId_idx" ON "OrganisationRating"("appointmentId");

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "OrganisationProjectAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationRating" ADD CONSTRAINT "OrganisationRating_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationRating" ADD CONSTRAINT "OrganisationRating_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "OrganisationProjectAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationRating" ADD CONSTRAINT "OrganisationRating_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

