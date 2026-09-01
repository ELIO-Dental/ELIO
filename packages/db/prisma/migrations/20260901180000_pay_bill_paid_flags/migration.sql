-- AlterTable
ALTER TABLE "pay_lab_bill_entries" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paidAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pay_supplier_invoice_entries" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paidAt" TIMESTAMP(3);
