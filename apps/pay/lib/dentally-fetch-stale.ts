/** Stuck RUNNING recovery for pay-period Dentally fetch jobs. */

/** 45m — absolute backstop for a month-scoped fetch. The heartbeat check in
 * dentally-fetch-job.ts (PAY_DENTALLY_FETCH_HEARTBEAT_STALE_MS) is what actually
 * catches a dead `after()` worker quickly; this stays high as a belt-and-braces cap. */
export const PAY_DENTALLY_FETCH_STALE_MS = 45 * 60 * 1000;

/** No progress in this long while RUNNING = the background worker almost certainly
 * died (Vercel killed the `after()` job at its maxDuration, or the instance crashed).
 * A single Dentally page + a chunk of DB writes should never take this long. */
export const PAY_DENTALLY_FETCH_HEARTBEAT_STALE_MS = 4 * 60 * 1000;

export function isPayDentallyFetchStale(
  startedAt: Date | string | null | undefined,
  now: Date = new Date(),
  staleMs: number = PAY_DENTALLY_FETCH_STALE_MS
): boolean {
  if (startedAt == null) return true;
  const t = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= staleMs;
}

export const STALE_FETCH_ERROR_MESSAGE =
  "Dentally fetch timed out or was interrupted — please retry";
