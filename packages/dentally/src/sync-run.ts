// Persists Dentally sync run metadata (Phase A.3) for portal status + error surfacing.
//
// IMPORTANT (2026-09-10 live incident): an earlier version of this file auto-failed
// a RUNNING row whenever it looked heartbeat-stale, and did so as a side effect of
// ordinary reads (getLatestDentallySyncRun / hasActiveDentallySyncRun) — i.e. every
// time anyone loaded the Integrations page. Proven live: a run's `lastHeartbeatAt`
// kept advancing for 9 minutes AFTER we'd already written `status: FAILED` — the
// Inngest job was never dead, it was just slow (rate-limit backoff, worse with a
// concurrent Pay fetch hitting the same Dentally API key), and Inngest's own retry
// backoff between steps can legitimately span many minutes. No fixed timer can tell
// "slow but alive" apart from "actually dead" here, so we stopped trying to guess on
// every page load:
// - Reads (getLatestDentallySyncRun, hasActiveDentallySyncRun) are now PURE — they
//   never mutate status. What you see reflects exactly what the sync job itself (or
//   Inngest's onFailure hook after retries are truly exhausted) wrote.
// - failStaleDentallySyncRuns still exists, but only runs from two places a human or
//   an ops schedule explicitly triggers: the "Reset stuck sync" button (immediate,
//   informed choice) and the daily cron backstop (STALE_RUNNING_MS, set to just
//   past Inngest's own `timeouts.finish: "12h"` so it only ever fires once Inngest
//   itself must already have given up).
import { prisma, Prisma, type DentallySyncRunStatus, type DentallySyncTrigger } from "@elio/db";
import type { SyncResult } from "./sync";

/** Absolute ceiling for the cron backstop only — set just past Inngest's own function
 * `timeouts.finish: "12h"` (see inngest.ts) so this can never contradict a run Inngest
 * itself still considers live. Not used on any read path — see file header. */
export const STALE_RUNNING_MS = 12.5 * 60 * 60 * 1000; // 12h30m

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
          : Prisma.JsonNull,
      // A run that reaches here genuinely finished — clear any stale abandonment
      // message a prior over-eager stale sweep may have written onto this same row
      // (see the file header). Without this, a run that actually completed fine could
      // still show a leftover red error box under a SUCCESS badge.
      errorMessage: null,
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

/** Marks RUNNING rows older than STALE_RUNNING_MS as FAILED. Only ever called
 * explicitly — from the daily cron (apps/shell/app/api/cron/clear-stuck-dentally-sync)
 * or the ops `?force=1` variant — never from a read path. See file header for why:
 * heartbeat-based auto-failing on every page load was proven to kill runs that were
 * still genuinely alive, just slow. */
export async function failStaleDentallySyncRuns(practiceId?: string) {
  const absoluteCutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const stuck = await prisma.dentallySyncRun.findMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: absoluteCutoff },
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

/** Pure read — does not mutate. See file header for why this no longer auto-fails a
 *  stale-looking row: a live sync's real progress must never be second-guessed just
 *  because someone loaded this page. */
export async function getLatestDentallySyncRun(practiceId: string) {
  return prisma.dentallySyncRun.findFirst({
    where: { practiceId },
    orderBy: { startedAt: "desc" },
  });
}

/** True when a RUNNING sync should block a new "Sync now" click. Pure read — does
 * not auto-fail anything (see file header). This is a UX convenience only, not the
 * correctness guard against duplicate work: Inngest's own
 * `concurrency: [{ limit: 1, key: practiceId }]` (inngest.ts) is what actually
 * prevents two real syncs from running at once — if a click gets through while an
 * old run is secretly dead, Inngest just queues it, and if the old run turns out to
 * still be alive, letting the click through was correct anyway. Genuinely stuck runs
 * are cleared via the "Reset stuck sync" button or the daily cron backstop, not by
 * silently overriding what this returns. */
export async function hasActiveDentallySyncRun(practiceId: string) {
  const active = await prisma.dentallySyncRun.findFirst({
    where: { practiceId, status: "RUNNING" },
    select: { id: true },
  });
  return Boolean(active);
}
