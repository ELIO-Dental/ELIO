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
// Two entry points:
// - `dentallySyncScheduled`: cron-triggered full sync (registered on a
//   schedule below; the actual cron dispatch happens via Inngest Cloud once
//   this function is deployed, OR via an app-level cron route calling
//   `inngest.send()` — apps/shell's /api/cron/dentally-sync does the latter
//   so the schedule lives in one place: Vercel's vercel.json cron config).
// - `dentallySyncManual`: fired by the "Sync now" button
//   (apps/shell's POST /api/dentally/sync), preserving the UX pattern from
//   ElioPay aurapay's synchronous /api/dentally route — except here the route
//   returns immediately (202-style) and the UI polls the returned run's
//   status, per PERFORMANCE_SCALABILITY.md section 1's pattern, instead of
//   blocking the request on the full sync.

import { Inngest, EventSchemas } from "inngest";
import { runDentallySyncJob } from "./sync-job";

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

export const dentallySyncFunction = inngest.createFunction(
  { id: "dentally-full-sync", retries: 2 },
  { event: "dentally/sync.requested" },
  async ({ event, step }) => {
    const { practiceId, trigger } = event.data;
    return step.run("dentally-sync-job", () => runDentallySyncJob(practiceId, trigger));
  }
);

export { requestDentallySync, inngestConfigured } from "./sync-job";
