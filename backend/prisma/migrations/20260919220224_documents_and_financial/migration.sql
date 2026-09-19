-- AlterTable
ALTER TABLE "ComplianceRecord" DROP COLUMN "attachmentUrl",
ADD COLUMN     "attachmentFilename" TEXT,
ADD COLUMN     "attachmentMimeType" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentStoredName" TEXT,
ADD COLUMN     "sharePointUrl" TEXT;

-- AlterTable
ALTER TABLE "Contractor" ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "creditTerms" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "preferredPaymentMethod" TEXT,
ADD COLUMN     "withholdingTaxInfo" TEXT;

