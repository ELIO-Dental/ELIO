-- Step 26 — PayslipVersion (immutable PDF snapshot on lock; additive)
CREATE TABLE IF NOT EXISTS "pay_payslip_versions" (
  "id" TEXT NOT NULL,
  "practiceId" TEXT NOT NULL,
  "payslipEntryId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "pdfBase64" TEXT NOT NULL,
  "contentSha256" TEXT NOT NULL,
  "provisional" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_payslip_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pay_payslip_versions_payslipEntryId_version_key"
  ON "pay_payslip_versions"("payslipEntryId", "version");
CREATE INDEX IF NOT EXISTS "pay_payslip_versions_practiceId_idx"
  ON "pay_payslip_versions"("practiceId");
CREATE INDEX IF NOT EXISTS "pay_payslip_versions_payslipEntryId_idx"
  ON "pay_payslip_versions"("payslipEntryId");

DO $$ BEGIN
  ALTER TABLE "pay_payslip_versions"
    ADD CONSTRAINT "pay_payslip_versions_practiceId_fkey"
    FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pay_payslip_versions"
    ADD CONSTRAINT "pay_payslip_versions_payslipEntryId_fkey"
    FOREIGN KEY ("payslipEntryId") REFERENCES "pay_payslip_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
