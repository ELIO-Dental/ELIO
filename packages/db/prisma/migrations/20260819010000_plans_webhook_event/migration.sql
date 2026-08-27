-- Additive only: new table for GoCardless webhook replay-guard idempotency
-- (Step 1.7). Does not touch any existing table/column, so it is safe against
-- the shared live-production Neon database.
CREATE TABLE "plans_webhook_events" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_webhook_events_pkey" PRIMARY KEY ("id")
);
