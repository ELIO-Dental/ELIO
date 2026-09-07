-- AuraPay parity: explicit NHS flag + active status on dentists.
ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "isNhs" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pay_dentists" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- Soft-removed rows used a name prefix; flip to active=false and restore display names.
UPDATE "pay_dentists"
SET
  "active" = false,
  "name" = regexp_replace("name", '^\[REMOVED\]\s*', '')
WHERE "name" LIKE '[REMOVED]%';

-- Best-effort NHS backfill until Turso sync: performer # or positive UDA rate.
UPDATE "pay_dentists"
SET "isNhs" = true
WHERE (
  ("nhsPerformerNumber" IS NOT NULL AND btrim("nhsPerformerNumber") <> '')
  OR ("udaRatePence" IS NOT NULL AND "udaRatePence" > 0)
);
