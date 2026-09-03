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
import {
  markDentallySyncFailedFromInngest,
  runDentallySyncJobWithSteps,
} from "./sync-job";

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
  {
    id: "dentally-full-sync",
    retries: 2,
    // Wall-clock budget across many short serverless invocations (not one step).
    timeouts: { finish: "2h" },
    onFailure: async ({ error, event }) => {
      const original = event.data.event;
      const practiceId = original?.data?.practiceId as string | undefined;
      if (!practiceId) return;
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Dentally sync failed after retries";
      await markDentallySyncFailedFromInngest(practiceId, message);
    },
  },
  { event: "dentally/sync.requested" },
  async ({ event, step }) => {
    const { practiceId, trigger } = event.data;
    return runDentallySyncJobWithSteps(step, practiceId, trigger);
  }
);

export { requestDentallySync, inngestConfigured } from "./sync-job";
