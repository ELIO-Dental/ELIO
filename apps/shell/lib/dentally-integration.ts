import { prisma } from "@elio/db";
import { getDentallyClientForPractice, getLatestDentallySyncRun } from "@elio/dentally";

export interface DentallyIntegrationStatus {
  configured: boolean;
  hasPracticeKey: boolean;
  connectionStatus: "NOT_CONNECTED" | "CONNECTED" | "ERROR";
  connectionOk: boolean | null;
  connectionError: string | null;
  latestRun: {
    id: string;
    status: string;
    trigger: string;
    startedAt: string;
    finishedAt: string | null;
    counts: unknown;
    errorMessage: string | null;
    recordErrorCount: number;
  } | null;
}

export async function getDentallyIntegrationStatus(
  practiceId: string,
  options?: { testConnection?: boolean }
): Promise<DentallyIntegrationStatus> {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { dentallyApiKey: true, dentallyConnectionStatus: true },
  });
  if (!practice) throw new Error("Practice not found");

  const hasPracticeKey = Boolean(practice.dentallyApiKey?.trim());
  const configured = Boolean(
    hasPracticeKey || process.env.DENTALLY_API_KEY?.trim() || process.env.DENTALLY_API_TOKEN?.trim()
  );
  const latestRun = await getLatestDentallySyncRun(practiceId);

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
    latestRun: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          trigger: latestRun.trigger,
          startedAt: latestRun.startedAt.toISOString(),
          finishedAt: latestRun.finishedAt?.toISOString() ?? null,
          counts: latestRun.counts,
          errorMessage: latestRun.errorMessage,
          recordErrorCount: Array.isArray(latestRun.recordErrors)
            ? (latestRun.recordErrors as unknown[]).length
            : 0,
        }
      : null,
  };
}
