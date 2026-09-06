-- AlterTable
ALTER TABLE "users" ADD COLUMN "displayName" TEXT;

-- AlterTable
ALTER TABLE "pay_supplier_invoice_entries" ADD COLUMN "dentistId" TEXT,
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "fileUrl" TEXT;

-- CreateIndex
CREATE INDEX "pay_supplier_invoice_entries_dentistId_idx" ON "pay_supplier_invoice_entries"("dentistId");

-- CreateIndex
CREATE INDEX "pay_supplier_invoice_entries_invoiceDate_idx" ON "pay_supplier_invoice_entries"("invoiceDate");

-- AddForeignKey
ALTER TABLE "pay_supplier_invoice_entries" ADD CONSTRAINT "pay_supplier_invoice_entries_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
