-- AlterTable
ALTER TABLE "pay_saved_labs" ADD COLUMN "accountName" TEXT,
ADD COLUMN "sortCode" TEXT,
ADD COLUMN "accountNumber" TEXT;

-- AlterTable
ALTER TABLE "pay_saved_suppliers" ADD COLUMN "accountName" TEXT,
ADD COLUMN "sortCode" TEXT,
ADD COLUMN "accountNumber" TEXT;
