-- AlterTable
ALTER TABLE "ResourcePriceHistory" ADD COLUMN     "sourceRfqId" TEXT;

-- AlterTable
ALTER TABLE "Rfq" ADD COLUMN     "awardedAt" TIMESTAMP(3),
ADD COLUMN     "awardedQuoteId" TEXT,
ADD COLUMN     "costRegionId" TEXT,
ADD COLUMN     "pricesUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RfqItem" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "resourceId" TEXT,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rfqItemId" TEXT NOT NULL,
    "unitRate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RfqItem_rfqId_idx" ON "RfqItem"("rfqId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteItem_quoteId_rfqItemId_key" ON "QuoteItem"("quoteId", "rfqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_awardedQuoteId_key" ON "Rfq"("awardedQuoteId");

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_costRegionId_fkey" FOREIGN KEY ("costRegionId") REFERENCES "CostRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_awardedQuoteId_fkey" FOREIGN KEY ("awardedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqItem" ADD CONSTRAINT "RfqItem_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqItem" ADD CONSTRAINT "RfqItem_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "CostResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES "RfqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
