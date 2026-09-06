import { after } from "next/server";
import { Prisma, scopedDb } from "@elio/db";
import {
  DentallyFetchConfigError,
  fetchDentallyForPayPeriod,
  type DentallyFetchResult,
} from "./dentally-fetch";

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

/** Read fetch job status from DB (UI / GET — never hits Dentally). */
export async function getPayPeriodDentallyFetchStatus(
  practiceId: string,
  payPeriodId: string
): Promise<PayDentallyFetchStatusResponse> {
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

async function markFetchRunning(practiceId: string, payPeriodId: string) {
  const db = scopedDb(practiceId);
  await db.payPeriod.update({
    where: { id: payPeriodId },
    data: {
      dentallyFetchStatus: "RUNNING",
      dentallyFetchStartedAt: new Date(),
      dentallyFetchFinishedAt: null,
      dentallyFetchError: null,
      dentallyFetchResultJson: Prisma.DbNull,
    },
  });
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
 * Marks the period RUNNING and schedules the fetch after the HTTP response
 * (Next.js `after` — survives the request without blocking the UI).
 */
export async function enqueuePayPeriodDentallyFetch(
  practiceId: string,
  payPeriodId: string
): Promise<EnqueuePayDentallyFetchResult> {
  const db = scopedDb(practiceId);
  const period = await db.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: { status: true, dentallyFetchStatus: true },
  });
  if (!period) throw new Error("Pay period not found");
  if (period.status === "LOCKED") throw new Error("Pay period is locked");
  if (period.dentallyFetchStatus === "RUNNING") {
    return { mode: "already_running", status: "RUNNING" };
  }

  await markFetchRunning(practiceId, payPeriodId);

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
