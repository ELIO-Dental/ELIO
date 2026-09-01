import { scopedDb } from "@elio/db";
import { getDentallyClientForPractice, getLatestDentallySyncRun } from "@elio/dentally";

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
  const configured = Boolean(
    hasPracticeKey || process.env.DENTALLY_API_KEY?.trim() || process.env.DENTALLY_API_TOKEN?.trim()
  );

  let connectionOk: boolean | null = null;
  let connectionError: string | null = null;
  if (options?.testConnection && configured) {
    try {
      const client = await getDentallyClientForPractice(practiceId);
      await client.get("/patients", { per_page: 1, page: 1 });
      connectionOk = true;
      await db.practice.update({
        where: { id: practiceId },
        data: { dentallyConnectionStatus: "CONNECTED" },
      });
    } catch (err) {
      connectionOk = false;
      connectionError = err instanceof Error ? err.message : String(err);
      await db.practice.update({
        where: { id: practiceId },
        data: { dentallyConnectionStatus: "ERROR" },
      });
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
