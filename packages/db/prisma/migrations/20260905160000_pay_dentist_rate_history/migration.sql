-- Step 21 — per-dentist share overrides + rate history (additive)
ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "labShareBp" INTEGER;
ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "financeShareBp" INTEGER;
ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "therapyHourlyPence" INTEGER;

CREATE TABLE IF NOT EXISTS "pay_dentist_rate_history" (
  "id" TEXT NOT NULL,
  "practiceId" TEXT NOT NULL,
  "dentistId" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "privateSplitPercent" DECIMAL(5,2),
  "udaRatePence" INTEGER,
  "hourlyRatePence" INTEGER,
  "labShareBp" INTEGER,
  "financeShareBp" INTEGER,
  "therapyHourlyPence" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_dentist_rate_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pay_dentist_rate_history_dentistId_effectiveFrom_idx"
  ON "pay_dentist_rate_history"("dentistId", "effectiveFrom");
CREATE INDEX IF NOT EXISTS "pay_dentist_rate_history_practiceId_idx"
  ON "pay_dentist_rate_history"("practiceId");

DO $$ BEGIN
  ALTER TABLE "pay_dentist_rate_history"
    ADD CONSTRAINT "pay_dentist_rate_history_practiceId_fkey"
    FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "pay_dentist_rate_history"
    ADD CONSTRAINT "pay_dentist_rate_history_dentistId_fkey"
    FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
