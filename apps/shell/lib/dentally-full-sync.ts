import { inngest, runDentallySyncJob } from "@elio/dentally";

/** Shell Inngest job: central Dentally sync; Flow import runs via post-sync hook (F1.1). */
export const dentallyFullSyncFunction = inngest.createFunction(
  { id: "dentally-full-sync", retries: 2 },
  { event: "dentally/sync.requested" },
  async ({ event, step }) => {
    const { practiceId, trigger } = event.data;
    return step.run("dentally-sync-job", () => runDentallySyncJob(practiceId, trigger));
  }
);
