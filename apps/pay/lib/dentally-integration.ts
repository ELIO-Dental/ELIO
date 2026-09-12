import { scopedDb } from "@elio/db";
import { getDentallyClientForPractice, getLatestDentallySyncRun } from "@elio/dentally";
import { isDentallyKeyConfigured } from "./dentally-integration-helpers";

export interface PayDentallyIntegrationStatus {
  configured: boolean;
  hasPracticeKey: boolean;
  connectionStatus: "NOT_CONNECTED" | "CONNECTED" | "ERROR";
  connectionOk: boolean | null;
  connectionError: string | null;
}

export async function getPayDentallyIntegrationStatus(
  practiceId: string,
  options?: { testConnection?: boolean }
): Promise<PayDentallyIntegrationStatus> {
  const db = scopedDb(practiceId);
  const practice = await db.practice.findUnique({
    where: { id: practiceId },
    select: { dentallyApiKey: true, dentallyConnectionStatus: true },
  });
  if (!practice) throw new Error("Practice not found");

  const hasPracticeKey = Boolean(practice.dentallyApiKey?.trim());
  const configured = isDentallyKeyConfigured({
    hasPracticeKey,
    envApiKey: process.env.DENTALLY_API_KEY,
    envApiToken: process.env.DENTALLY_API_TOKEN,
  });

  // `dentallyConnectionStatus` is shared across shell/pay/plans/flow and is
  // otherwise driven exclusively by actual sync-run outcomes (finalize/fail
  // in sync-run.ts) — a connection test here only proves the API key
  // currently authenticates, which is a different fact from "the last sync
  // succeeded." Writing it from here (as this used to) could flip a
  // genuinely-failed sync's ERROR status back to CONNECTED just because the
  // key still works, contradicting the DB-recorded sync outcome and
  // confusing shell's own (read-only) display of the same field — found in
  // a stability review, 2026-09-12. apps/shell's own equivalent test
  // (lib/dentally-integration.ts) never wrote to the DB either; matching
  // that here instead of shell matching pay's old behavior.
  let connectionOk: boolean | null = null;
  let connectionError: string | null = null;
  if (options?.testConnection && configured) {
    try {
      const client = await getDentallyClientForPractice(practiceId);
      await client.get("/patients", { per_page: 1, page: 1 });
      connectionOk = true;
    } catch (err) {
      connectionOk = false;
      connectionError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    configured,
    hasPracticeKey,
    connectionStatus: practice.dentallyConnectionStatus,
    connectionOk,
    connectionError,
  };
}

export async function getPayDentallySyncHint(practiceId: string) {
  const latestRun = await getLatestDentallySyncRun(practiceId);
  return latestRun
    ? {
        status: latestRun.status,
        finishedAt: latestRun.finishedAt?.toISOString() ?? null,
        errorMessage: latestRun.errorMessage,
      }
    : null;
}
