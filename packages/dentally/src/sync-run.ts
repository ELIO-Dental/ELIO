// Persists Dentally sync run metadata (Phase A.3) for portal status + error surfacing.

import { prisma, type DentallySyncRunStatus, type DentallySyncTrigger } from "@elio/db";
import type { SyncResult } from "./sync";

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

export async function getLatestDentallySyncRun(practiceId: string) {
  return prisma.dentallySyncRun.findFirst({
    where: { practiceId },
    orderBy: { startedAt: "desc" },
  });
}
