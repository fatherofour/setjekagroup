-- AlterTable
ALTER TABLE "ProjectContract" ADD COLUMN     "escalationBaseMonth" TIMESTAMP(3),
ADD COLUMN     "escalationFixedPct" DOUBLE PRECISION NOT NULL DEFAULT 15,
ADD COLUMN     "escalationLagMonths" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Valuation" ADD COLUMN     "escalationNote" TEXT,
ADD COLUMN     "escalationToDate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PriceIndex" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceIndex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceIndexValue" (
    "id" TEXT NOT NULL,
    "indexId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PriceIndexValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractEscalationWeight" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "indexId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ContractEscalationWeight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceIndex_code_key" ON "PriceIndex"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PriceIndexValue_indexId_month_key" ON "PriceIndexValue"("indexId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ContractEscalationWeight_contractId_indexId_key" ON "ContractEscalationWeight"("contractId", "indexId");

-- AddForeignKey
ALTER TABLE "PriceIndexValue" ADD CONSTRAINT "PriceIndexValue_indexId_fkey" FOREIGN KEY ("indexId") REFERENCES "PriceIndex"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractEscalationWeight" ADD CONSTRAINT "ContractEscalationWeight_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractEscalationWeight" ADD CONSTRAINT "ContractEscalationWeight_indexId_fkey" FOREIGN KEY ("indexId") REFERENCES "PriceIndex"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

