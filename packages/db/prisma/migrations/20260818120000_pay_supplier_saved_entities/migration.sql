-- CreateTable
CREATE TABLE "pay_supplier_invoice_entries" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "supplierId" TEXT,
    "amountPence" INTEGER NOT NULL,
    "description" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_supplier_invoice_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_saved_labs" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_saved_labs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_saved_suppliers" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_saved_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_supplier_invoice_entries_practiceId_idx" ON "pay_supplier_invoice_entries"("practiceId");

-- CreateIndex
CREATE INDEX "pay_supplier_invoice_entries_supplierId_idx" ON "pay_supplier_invoice_entries"("supplierId");

-- CreateIndex
CREATE INDEX "pay_saved_labs_practiceId_idx" ON "pay_saved_labs"("practiceId");

-- CreateIndex
CREATE INDEX "pay_saved_suppliers_practiceId_idx" ON "pay_saved_suppliers"("practiceId");

-- AddForeignKey
ALTER TABLE "pay_supplier_invoice_entries" ADD CONSTRAINT "pay_supplier_invoice_entries_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_supplier_invoice_entries" ADD CONSTRAINT "pay_supplier_invoice_entries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "pay_saved_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_saved_labs" ADD CONSTRAINT "pay_saved_labs_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_saved_suppliers" ADD CONSTRAINT "pay_saved_suppliers_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

