-- Step 14 — PaidInvoiceLineLog (additive; safe to re-run)
CREATE TABLE IF NOT EXISTS "pay_paid_invoice_line_logs" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pay_paid_invoice_line_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_practiceId_invoiceId_lineKey_key"
  ON "pay_paid_invoice_line_logs"("practiceId", "invoiceId", "lineKey");

CREATE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_practiceId_idx"
  ON "pay_paid_invoice_line_logs"("practiceId");

CREATE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_payPeriodId_idx"
  ON "pay_paid_invoice_line_logs"("payPeriodId");

CREATE INDEX IF NOT EXISTS "pay_paid_invoice_line_logs_dentistId_idx"
  ON "pay_paid_invoice_line_logs"("dentistId");

DO $$ BEGIN
  ALTER TABLE "pay_paid_invoice_line_logs"
    ADD CONSTRAINT "pay_paid_invoice_line_logs_practiceId_fkey"
    FOREIGN KEY ("practiceId") REFERENCES "practices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "pay_paid_invoice_line_logs"
    ADD CONSTRAINT "pay_paid_invoice_line_logs_dentistId_fkey"
    FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "pay_paid_invoice_line_logs"
    ADD CONSTRAINT "pay_paid_invoice_line_logs_payPeriodId_fkey"
    FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
