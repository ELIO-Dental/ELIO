-- Phase A.3 — Dentally sync run metadata for portal Integrations status.

CREATE TYPE "DentallySyncRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');
CREATE TYPE "DentallySyncTrigger" AS ENUM ('MANUAL', 'SCHEDULED');

CREATE TABLE "dentally_sync_runs" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "trigger" "DentallySyncTrigger" NOT NULL,
    "status" "DentallySyncRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "counts" JSONB,
    "errorMessage" TEXT,
    "recordErrors" JSONB,

    CONSTRAINT "dentally_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dentally_sync_runs_practiceId_startedAt_idx" ON "dentally_sync_runs"("practiceId", "startedAt");

ALTER TABLE "dentally_sync_runs" ADD CONSTRAINT "dentally_sync_runs_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
