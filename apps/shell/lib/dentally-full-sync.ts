import {
  inngest,
  markDentallySyncFailedFromInngest,
  runDentallySyncJobWithSteps,
} from "@elio/dentally";

/**
 * Shell Inngest job: central Dentally sync with one step per Dentally list page
 * (e.g. sync-patients-p1) so production syncs stay under Vercel maxDuration.
 * Flow consult import runs as the final post-sync step (F1.1).
 */
export const dentallyFullSyncFunction = inngest.createFunction(
  {
    id: "dentally-full-sync",
    retries: 2,
    timeouts: { finish: "12h" },
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
