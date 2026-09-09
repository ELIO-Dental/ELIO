import { after } from "next/server";
import { Prisma, scopedDb } from "@elio/db";
import {
  DentallyFetchConfigError,
  fetchDentallyForPayPeriod,
  type DentallyFetchResult,
} from "./dentally-fetch";
import {
  isPayDentallyFetchStale,
  PAY_DENTALLY_FETCH_STALE_MS,
  STALE_FETCH_ERROR_MESSAGE,
} from "./dentally-fetch-stale";

export type PayDentallyFetchStatusDto = "IDLE" | "RUNNING" | "SUCCESS" | "ERROR";

export interface PayDentallyFetchStatusResponse {
  status: PayDentallyFetchStatusDto;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: DentallyFetchResult | null;
}

function asFetchResult(json: unknown): DentallyFetchResult | null {
  if (!json || typeof json !== "object") return null;
  return json as DentallyFetchResult;
}

/**
 * If a fetch was marked RUNNING but never finished (after() crash, deploy, timeout),
 * flip it to ERROR so UI/calc/retry are not permanently blocked.
 */
export async function recoverStalePayPeriodDentallyFetch(
  practiceId: string,
  payPeriodId: string,
  now: Date = new Date(),
  staleMs: number = PAY_DENTALLY_FETCH_STALE_MS
): Promise<boolean> {
  const db = scopedDb(practiceId);
  const period = await db.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: { dentallyFetchStatus: true, dentallyFetchStartedAt: true },
  });
  if (!period || period.dentallyFetchStatus !== "RUNNING") return false;
  if (!isPayDentallyFetchStale(period.dentallyFetchStartedAt, now, staleMs)) return false;

  const result = await db.payPeriod.updateMany({
    where: {
      id: payPeriodId,
      dentallyFetchStatus: "RUNNING",
    },
    data: {
      dentallyFetchStatus: "ERROR",
      dentallyFetchFinishedAt: now,
      dentallyFetchError: STALE_FETCH_ERROR_MESSAGE,
    },
  });
  return result.count > 0;
}

/** Read fetch job status from DB (UI / GET — never hits Dentally). */
export async function getPayPeriodDentallyFetchStatus(
  practiceId: string,
  payPeriodId: string
): Promise<PayDentallyFetchStatusResponse> {
  await recoverStalePayPeriodDentallyFetch(practiceId, payPeriodId);

  const db = scopedDb(practiceId);
  const period = await db.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: {
      dentallyFetchStatus: true,
      dentallyFetchStartedAt: true,
      dentallyFetchFinishedAt: true,
      dentallyFetchError: true,
      dentallyFetchResultJson: true,
    },
  });
  if (!period) throw new Error("Pay period not found");

  return {
    status: period.dentallyFetchStatus,
    startedAt: period.dentallyFetchStartedAt?.toISOString() ?? null,
    finishedAt: period.dentallyFetchFinishedAt?.toISOString() ?? null,
    error: period.dentallyFetchError,
    result: asFetchResult(period.dentallyFetchResultJson),
  };
}

/**
 * Atomic claim: only one RUNNING writer per period.
 * Returns whether we claimed, or why we could not.
 */
export async function claimPayPeriodDentallyFetchRunning(
  practiceId: string,
  payPeriodId: string
): Promise<"claimed" | "already_running" | "locked" | "not_found"> {
  const db = scopedDb(practiceId);
  const period = await db.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: { status: true },
  });
  if (!period) return "not_found";
  if (period.status === "LOCKED") return "locked";

  await recoverStalePayPeriodDentallyFetch(practiceId, payPeriodId);

  const claimed = await db.payPeriod.updateMany({
    where: {
      id: payPeriodId,
      status: { not: "LOCKED" },
      dentallyFetchStatus: { not: "RUNNING" },
    },
    data: {
      dentallyFetchStatus: "RUNNING",
      dentallyFetchStartedAt: new Date(),
      dentallyFetchFinishedAt: null,
      dentallyFetchError: null,
      dentallyFetchResultJson: Prisma.DbNull,
    },
  });

  if (claimed.count === 1) return "claimed";

  const again = await db.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: { status: true, dentallyFetchStatus: true },
  });
  if (!again) return "not_found";
  if (again.status === "LOCKED") return "locked";
  return "already_running";
}

async function markFetchSuccess(
  practiceId: string,
  payPeriodId: string,
  result: DentallyFetchResult
) {
  const db = scopedDb(practiceId);
  await db.payPeriod.update({
    where: { id: payPeriodId },
    data: {
      dentallyFetchStatus: "SUCCESS",
      dentallyFetchFinishedAt: new Date(),
      dentallyFetchError: null,
      dentallyFetchResultJson: result as unknown as Prisma.InputJsonValue,
    },
  });
}

async function markFetchError(practiceId: string, payPeriodId: string, message: string) {
  const db = scopedDb(practiceId);
  await db.payPeriod.update({
    where: { id: payPeriodId },
    data: {
      dentallyFetchStatus: "ERROR",
      dentallyFetchFinishedAt: new Date(),
      dentallyFetchError: message.slice(0, 2000),
    },
  });
}

/** Runs the Dentally pay-period fetch and persists SUCCESS/ERROR on the period. */
export async function runPayPeriodDentallyFetchJob(
  practiceId: string,
  payPeriodId: string
): Promise<DentallyFetchResult> {
  try {
    const result = await fetchDentallyForPayPeriod(practiceId, payPeriodId);
    await markFetchSuccess(practiceId, payPeriodId, result);
    return result;
  } catch (err) {
    const message =
      err instanceof DentallyFetchConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    await markFetchError(practiceId, payPeriodId, message).catch(() => undefined);
    throw err;
  }
}

export type EnqueuePayDentallyFetchResult =
  | { mode: "queued"; status: "RUNNING" }
  | { mode: "already_running"; status: "RUNNING" };

/**
 * Marks the period RUNNING (atomic claim) and schedules the fetch after the HTTP
 * response (Next.js `after` — survives the request without blocking the UI).
 */
export async function enqueuePayPeriodDentallyFetch(
  practiceId: string,
  payPeriodId: string
): Promise<EnqueuePayDentallyFetchResult> {
  const claim = await claimPayPeriodDentallyFetchRunning(practiceId, payPeriodId);
  if (claim === "not_found") throw new Error("Pay period not found");
  if (claim === "locked") throw new Error("Pay period is locked");
  if (claim === "already_running") {
    return { mode: "already_running", status: "RUNNING" };
  }

  after(() =>
    runPayPeriodDentallyFetchJob(practiceId, payPeriodId).catch((err) => {
      console.error(
        `[pay-dentally-fetch] background job failed practice=${practiceId} period=${payPeriodId}`,
        err
      );
    })
  );

  return { mode: "queued", status: "RUNNING" };
}
