-- revision1 Step 3: background Dentally fetch status on pay periods
DO $$ BEGIN
  CREATE TYPE "PayDentallyFetchStatus" AS ENUM ('IDLE', 'RUNNING', 'SUCCESS', 'ERROR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "dentallyFetchStatus" "PayDentallyFetchStatus" NOT NULL DEFAULT 'IDLE';
ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "dentallyFetchStartedAt" TIMESTAMP(3);
ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "dentallyFetchFinishedAt" TIMESTAMP(3);
ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "dentallyFetchError" TEXT;
ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "dentallyFetchResultJson" JSONB;
