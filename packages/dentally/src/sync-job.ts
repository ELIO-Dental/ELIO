// Shared Dentally sync job runner — used by Inngest and local dev fallback (Phase A.5).

import { syncPracticeDentallyData } from "./sync";
import {
  createDentallySyncRun,
  failDentallySyncRun,
  finalizeDentallySyncRun,
} from "./sync-run";
import { DentallySyncConfigError } from "./resolve-api-key";

export async function runDentallySyncJob(
  practiceId: string,
  trigger: "manual" | "scheduled"
) {
  const run = await createDentallySyncRun(practiceId, trigger);
  try {
    const result = await syncPracticeDentallyData(practiceId);
    await finalizeDentallySyncRun(run.id, result);
    return result;
  } catch (err) {
    const message =
      err instanceof DentallySyncConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    await failDentallySyncRun(run.id, practiceId, message);
    throw err;
  }
}

function inngestConfigured(): boolean {
  return Boolean(process.env.INNGEST_EVENT_KEY?.trim() || process.env.INNGEST_DEV === "1");
}

/** Enqueues a sync (Inngest Cloud/Dev Server) or runs inline when Inngest is not configured. */
export async function requestDentallySync(
  practiceId: string,
  trigger: "manual" | "scheduled"
) {
  if (inngestConfigured()) {
    const { inngest } = await import("./inngest");
    return inngest.send({
      name: "dentally/sync.requested",
      data: { practiceId, trigger },
    });
  }

  // Local dev without Inngest — fire-and-forget so the API still returns 202 immediately.
  void runDentallySyncJob(practiceId, trigger).catch((err) => {
    console.error(`[dentally-sync] inline fallback failed practice=${practiceId}`, err);
  });
  return { ids: ["inline-dev-sync"] };
}

export { inngestConfigured };
