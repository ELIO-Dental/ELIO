-- Dentally sync reliability: live progress + fast stuck-run detection.
--
-- Portal ("Sync now") and Pay ("Fetch from Dentally") both left the UI showing
-- an indefinite spinner with no way to tell a genuinely running sync apart
-- from one whose background worker died silently (Vercel timeout / crash) —
-- the only signal was an absolute 2h (portal) / 45m (pay) ceiling. These
-- columns let us surface live phase progress and detect a stall within
-- minutes instead of hours, and store the Inngest event id so ops can
-- cross-reference the Inngest dashboard against a specific DB row.

ALTER TABLE "dentally_sync_runs" ADD COLUMN IF NOT EXISTS "inngestEventId" TEXT;
ALTER TABLE "dentally_sync_runs" ADD COLUMN IF NOT EXISTS "currentPhase" TEXT;
ALTER TABLE "dentally_sync_runs" ADD COLUMN IF NOT EXISTS "currentPage" INTEGER;
ALTER TABLE "dentally_sync_runs" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE "dentally_sync_runs" ADD COLUMN IF NOT EXISTS "resumedFromRunId" TEXT;

-- Backfill existing rows so the heartbeat column is never NULL for historical runs.
UPDATE "dentally_sync_runs" SET "lastHeartbeatAt" = COALESCE("finishedAt", "startedAt")
WHERE "lastHeartbeatAt" IS NULL;

ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "dentallyFetchPhase" TEXT;
ALTER TABLE "pay_periods" ADD COLUMN IF NOT EXISTS "dentallyFetchHeartbeatAt" TIMESTAMP(3);
