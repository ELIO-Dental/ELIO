// Persists Dentally sync run metadata (Phase A.3) for portal status + error surfacing.

import { prisma, type DentallySyncRunStatus, type DentallySyncTrigger } from "@elio/db";
import type { SyncResult } from "./sync";

/** Runs older than this with status RUNNING are treated as abandoned (serverless
 * timeout / missing Inngest). Keeps Sync now from staying disabled forever. */
export const STALE_RUNNING_MS = 30 * 60 * 1000;

const STALE_RUNNING_MESSAGE =
  "Sync abandoned: stayed RUNNING with no finish (timeout or background worker unavailable). Click Sync now to retry.";

export function mapTrigger(trigger: "manual" | "scheduled"): DentallySyncTrigger {
  return trigger === "manual" ? "MANUAL" : "SCHEDULED";
}

export async function createDentallySyncRun(
  practiceId: string,
  trigger: "manual" | "scheduled"
) {
  return prisma.dentallySyncRun.create({
    data: {
      practiceId,
      trigger: mapTrigger(trigger),
      status: "RUNNING",
    },
  });
}

export function resolveRunStatus(result: SyncResult): DentallySyncRunStatus {
  const totalSynced =
    result.counts.patients +
    result.counts.appointments +
    result.counts.invoices +
    result.counts.treatments +
    result.counts.payments +
    result.counts.accounts +
    result.counts.paymentPlans;
  if (result.errors.length === 0) return "SUCCESS";
  if (totalSynced > 0) return "PARTIAL";
  return "FAILED";
}

export async function finalizeDentallySyncRun(runId: string, result: SyncResult) {
  const status = resolveRunStatus(result);
  await prisma.dentallySyncRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: result.finishedAt,
      counts: result.counts,
      recordErrors:
        result.errors.length > 0
          ? (JSON.parse(JSON.stringify(result.errors.slice(0, 100))) as object)
          : undefined,
    },
  });
  await prisma.practice.update({
    where: { id: result.practiceId },
    data: {
      dentallyConnectionStatus: status === "FAILED" ? "ERROR" : "CONNECTED",
    },
  });
}

export async function failDentallySyncRun(runId: string, practiceId: string, message: string) {
  await prisma.dentallySyncRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: message,
    },
  });
  await prisma.practice.update({
    where: { id: practiceId },
    data: { dentallyConnectionStatus: "ERROR" },
  });
}

/** Marks abandoned RUNNING rows FAILED so Integrations unlocks Sync now. */
export async function failStaleDentallySyncRuns(practiceId?: string) {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const stuck = await prisma.dentallySyncRun.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: cutoff },
      ...(practiceId ? { practiceId } : {}),
    },
    select: { id: true, practiceId: true },
  });
  if (stuck.length === 0) return { cleared: 0 };

  const now = new Date();
  await prisma.dentallySyncRun.updateMany({
    where: { id: { in: stuck.map((r) => r.id) } },
    data: {
      status: "FAILED",
      finishedAt: now,
      errorMessage: STALE_RUNNING_MESSAGE,
    },
  });

  const practiceIds = [...new Set(stuck.map((r) => r.practiceId))];
  await Promise.all(
    practiceIds.map((id) =>
      prisma.practice.update({
        where: { id },
        data: { dentallyConnectionStatus: "ERROR" },
      })
    )
  );

  return { cleared: stuck.length };
}

export async function getLatestDentallySyncRun(practiceId: string) {
  await failStaleDentallySyncRuns(practiceId);
  return prisma.dentallySyncRun.findFirst({
    where: { practiceId },
    orderBy: { startedAt: "desc" },
  });
}

/** True when a non-stale RUNNING sync should block a new Sync now. */
export async function hasActiveDentallySyncRun(practiceId: string) {
  await failStaleDentallySyncRuns(practiceId);
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const active = await prisma.dentallySyncRun.findFirst({
    where: {
      practiceId,
      status: "RUNNING",
      startedAt: { gte: cutoff },
    },
    select: { id: true },
  });
  return Boolean(active);
}
