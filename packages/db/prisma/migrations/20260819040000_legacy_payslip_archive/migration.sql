-- CreateTable
CREATE TABLE "pay_legacy_payslip_archive" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "dentistName" TEXT NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "rawRowJson" TEXT NOT NULL,
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_legacy_payslip_archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_legacy_payslip_archive_practiceId_idx" ON "pay_legacy_payslip_archive"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_legacy_payslip_archive_practiceId_sourceId_key" ON "pay_legacy_payslip_archive"("practiceId", "sourceId");

-- AddForeignKey
ALTER TABLE "pay_legacy_payslip_archive" ADD CONSTRAINT "pay_legacy_payslip_archive_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

