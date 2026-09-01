-- AlterTable
ALTER TABLE "pay_lab_bill_entries" ADD COLUMN "savedLabId" TEXT,
ADD COLUMN "labName" TEXT,
ADD COLUMN "fileUrl" TEXT,
ADD COLUMN "billDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "pay_lab_bill_entries_savedLabId_idx" ON "pay_lab_bill_entries"("savedLabId");
CREATE INDEX "pay_lab_bill_entries_billDate_idx" ON "pay_lab_bill_entries"("billDate");

-- AddForeignKey
ALTER TABLE "pay_lab_bill_entries" ADD CONSTRAINT "pay_lab_bill_entries_savedLabId_fkey" FOREIGN KEY ("savedLabId") REFERENCES "pay_saved_labs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
