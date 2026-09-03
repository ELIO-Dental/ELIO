// Shared Dentally sync job runner — used by Inngest and local dev fallback (Phase A.5).

import {
  DENTALLY_SYNC_PHASES,
  mergeSyncCounts,
  syncPracticeDentallyData,
  syncPracticeDentallyPhase,
  type SyncPhaseResult,
  type SyncResult,
} from "./sync";
import {
  createDentallySyncRun,
  failDentallySyncRun,
  failLatestRunningDentallySyncRun,
  finalizeDentallySyncRun,
} from "./sync-run";
import { DentallySyncConfigError } from "./resolve-api-key";

type PostSyncHook = (practiceId: string) => Promise<unknown>;
let postSyncHook: PostSyncHook | null = null;

/** Optional hook after a successful Dentally sync (e.g. Flow cosmetic consult import). */
export function setDentallyPostSyncHook(hook: PostSyncHook | null) {
  postSyncHook = hook;
}

export async function runDentallySyncJob(
  practiceId: string,
  trigger: "manual" | "scheduled"
) {
  const run = await createDentallySyncRun(practiceId, trigger);
  try {
    const result = await syncPracticeDentallyData(practiceId);
    await finalizeDentallySyncRun(run.id, result);
    if (postSyncHook) {
      try {
        await postSyncHook(practiceId);
      } catch (err) {
        console.error(`[dentally-sync] post-sync hook failed practice=${practiceId}`, err);
      }
    }
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

/** Minimal step handle — matches Inngest's `step.run` shape without importing the SDK here. */
export type DentallySyncStepRunner = {
  // Inngest JSON-ifies step outputs; keep this loose so SDK step types assign cleanly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (id: string, fn: () => Promise<any>) => Promise<any>;
};

/**
 * Production path: one Inngest step per Dentally resource so a full practice
 * sync can exceed a single serverless invocation (the bug that failed the
 * 16m monolith step on 2026-09-03).
 */
export async function runDentallySyncJobWithSteps(
  step: DentallySyncStepRunner,
  practiceId: string,
  trigger: "manual" | "scheduled"
): Promise<SyncResult> {
  const startedAtIso = new Date().toISOString();
  const runId = await step.run("create-sync-run", async () => {
    const run = await createDentallySyncRun(practiceId, trigger);
    return run.id;
  });

  try {
    const phases: SyncPhaseResult[] = [];
    for (const phase of DENTALLY_SYNC_PHASES) {
      const part = await step.run(`sync-${phase}`, () => syncPracticeDentallyPhase(practiceId, phase));
      phases.push(part);
    }

    const result: SyncResult = {
      practiceId,
      startedAt: new Date(startedAtIso),
      finishedAt: new Date(),
      counts: mergeSyncCounts(...phases.map((p) => p.counts)),
      errors: phases.flatMap((p) => p.errors),
    };

    await step.run("finalize-sync-run", () => finalizeDentallySyncRun(runId, result));

    if (postSyncHook) {
      await step.run("post-sync-hook", async () => {
        try {
          await postSyncHook!(practiceId);
        } catch (err) {
          console.error(`[dentally-sync] post-sync hook failed practice=${practiceId}`, err);
        }
      });
    }

    return result;
  } catch (err) {
    const message =
      err instanceof DentallySyncConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    await failDentallySyncRun(runId, practiceId, message).catch(() => undefined);
    throw err;
  }
}

/** Used by Inngest `onFailure` after retries are exhausted (or hard cancel). */
export async function markDentallySyncFailedFromInngest(
  practiceId: string,
  message: string
) {
  return failLatestRunningDentallySyncRun(
    practiceId,
    message.slice(0, 500) || "Dentally sync failed in background worker"
  );
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
