// Persists Dentally sync run metadata (Phase A.3) for portal status + error surfacing.

import { prisma, type DentallySyncRunStatus, type DentallySyncTrigger } from "@elio/db";
import type { SyncResult } from "./sync";

/** Absolute ceiling: a run older than this with status RUNNING is abandoned no matter
 * what. Kept high because multi-step Inngest syncs can legitimately span wall-clock
 * time across checkpoints on a very large practice. The heartbeat check below is what
 * actually catches a dead worker quickly — this is just the belt-and-braces backstop. */
export const STALE_RUNNING_MS = 2 * 60 * 60 * 1000; // 2h

/** A run whose heartbeat hasn't moved in this long is treated as stalled — a healthy
 * sync heartbeats after every Dentally page (seconds, not minutes), so this comfortably
 * covers a slow page/retry without making users wait hours to find out a worker died. */
export const STALE_HEARTBEAT_MS = 10 * 60 * 1000; // 10m

const STALE_RUNNING_MESSAGE =
  "Sync abandoned: stayed RUNNING with no progress (timeout or background worker unavailable). Click Sync now to retry.";

export function mapTrigger(trigger: "manual" | "scheduled"): DentallySyncTrigger {
  return trigger === "manual" ? "MANUAL" : "SCHEDULED";
}

export async function createDentallySyncRun(
  practiceId: string,
  trigger: "manual" | "scheduled",
  opts?: { inngestEventId?: string | null; resumedFromRunId?: string | null }
) {
  return prisma.dentallySyncRun.create({
    data: {
      practiceId,
      trigger: mapTrigger(trigger),
      status: "RUNNING",
      inngestEventId: opts?.inngestEventId ?? null,
      resumedFromRunId: opts?.resumedFromRunId ?? null,
      lastHeartbeatAt: new Date(),
    },
  });
}

/** Most recent run for a practice, used to decide whether a new run should resume a
 *  FAILED attempt instead of starting every phase from page 1 again. Only the single
 *  most recent run counts — an old failure with successful runs since must not trigger
 *  a resume (that data is already current). */
export async function findResumableDentallySyncRun(practiceId: string) {
  const latest = await prisma.dentallySyncRun.findFirst({
    where: { practiceId },
    orderBy: { startedAt: "desc" },
    select: { id: true, status: true, currentPhase: true, currentPage: true },
  });
  if (!latest || latest.status !== "FAILED" || !latest.currentPhase) return null;
  return {
    runId: latest.id,
    phase: latest.currentPhase,
    page: latest.currentPage ?? 0,
  };
}

/** Bumped once per completed sync step so stall-detection reacts in minutes, not hours,
 *  and so a subsequent failed-then-retried run knows exactly where to resume. */
export async function heartbeatDentallySyncRun(
  runId: string,
  phase: string,
  page: number
): Promise<void> {
  await prisma.dentallySyncRun.update({
    where: { id: runId },
    data: { lastHeartbeatAt: new Date(), currentPhase: phase, currentPage: page },
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
      counts: result.counts as object,
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

/** Fails the newest RUNNING row for a practice (Inngest onFailure / cancel). */
export async function failLatestRunningDentallySyncRun(practiceId: string, message: string) {
  const latest = await prisma.dentallySyncRun.findFirst({
    where: { practiceId, status: "RUNNING" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!latest) return { cleared: 0 };
  await failDentallySyncRun(latest.id, practiceId, message);
  return { cleared: 1, runId: latest.id };
}

/** Marks abandoned RUNNING rows FAILED so Integrations unlocks Sync now.
 * Stale = no heartbeat in STALE_HEARTBEAT_MS (catches a dead worker within minutes)
 * OR older than the STALE_RUNNING_MS absolute ceiling regardless of heartbeat. */
export async function failStaleDentallySyncRuns(practiceId?: string) {
  const nowMs = Date.now();
  const heartbeatCutoff = new Date(nowMs - STALE_HEARTBEAT_MS);
  const absoluteCutoff = new Date(nowMs - STALE_RUNNING_MS);
  const stuck = await prisma.dentallySyncRun.findMany({
    where: {
      status: "RUNNING",
      OR: [
        { lastHeartbeatAt: { lt: heartbeatCutoff } },
        { lastHeartbeatAt: null, startedAt: { lt: heartbeatCutoff } },
        { startedAt: { lt: absoluteCutoff } },
      ],
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

/** True when a non-stale RUNNING sync should block a new Sync now.
 * failStaleDentallySyncRuns above already flips anything stale to FAILED, so any
 * row still RUNNING here is heartbeating and genuinely active — no separate age
 * check needed (a prior version re-checked startedAt against the 2h ceiling here,
 * which incorrectly let a second sync start underneath a legitimately long-running
 * one once it passed 2h). */
export async function hasActiveDentallySyncRun(practiceId: string) {
  await failStaleDentallySyncRuns(practiceId);
  const active = await prisma.dentallySyncRun.findFirst({
    where: { practiceId, status: "RUNNING" },
    select: { id: true },
  });
  return Boolean(active);
}
