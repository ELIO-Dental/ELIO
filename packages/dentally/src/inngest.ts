// Background-job wiring for the Dentally sync (FR-9 + PERFORMANCE_SCALABILITY.md
// section 1's decision).
//
// Decision: Inngest, not Trigger.dev. Both are viable per the perf doc; Inngest
// was chosen because (a) its Next.js App Router adapter (`inngest/next`) is a
// single route handler with no separate worker process to deploy — fits this
// Vercel-only, no-extra-infra monorepo; (b) step functions checkpoint
// automatically, so a full sync that legitimately runs long (thousands of
// patients/appointments/invoices) survives serverless execution limits by
// resuming from the last completed step rather than needing to fit in one
// invocation; (c) built-in retry/backoff on steps complements (doesn't
// duplicate) the request-level backoff already in client.ts, which handles
// Dentally's own 429s within a single step.
//
// Production lesson (2026-09-03): a single `step.run` wrapping the entire sync
// still timed out (~16m) on Vercel. Phases are now separate steps.

import { Inngest, EventSchemas } from "inngest";

type DentallySyncEvents = {
  "dentally/sync.requested": {
    data: { practiceId: string; trigger: "manual" | "scheduled" };
  };
};

export const inngest = new Inngest({
  id: "elio",
  schemas: new EventSchemas().fromRecord<DentallySyncEvents>(),
  isDev: process.env.INNGEST_DEV === "1",
});

// The actual `dentally/sync.requested` handler lives in
// apps/shell/lib/dentally-full-sync.ts (id "dentally-full-sync") — that's the only
// app that registers an `/api/inngest` route, and it's the one Inngest Cloud/Dev
// dispatches to. A second `createFunction` with the same id/event used to live here
// too; it was never registered anywhere but exported from this package's public API,
// which is exactly the kind of accidental-duplicate-registration bug that produces
// two competing sync runs for one event if anything ever imported and served it.
// Deleted rather than fixed forward — do not recreate it here.

export { requestDentallySync, inngestConfigured } from "./sync-job";
