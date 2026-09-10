/** Stuck RUNNING recovery for pay-period Dentally fetch jobs. */

/** 45m — absolute backstop for a month-scoped fetch. The heartbeat check in
 * dentally-fetch-job.ts (PAY_DENTALLY_FETCH_HEARTBEAT_STALE_MS) is what actually
 * catches a dead `after()` worker quickly; this stays high as a belt-and-braces cap. */
export const PAY_DENTALLY_FETCH_STALE_MS = 45 * 60 * 1000;

/** No progress in this long while RUNNING = the background worker almost certainly
 * died (Vercel killed the `after()` job at its maxDuration, or the instance crashed).
 * fetchDentallyForPayPeriod heartbeats once per Dentally *page*, not just once per
 * phase (see dentally-fetch.ts) — a single page can legitimately take a while under
 * Dentally rate-limit backoff (worse if a Portal full sync is hitting the same API
 * key concurrently), so this needs headroom above one page's worst-case retry time,
 * not just above one phase's total time. Kept just above the route's own
 * maxDuration (300s) — in production that platform kill fires first on a genuine
 * dead worker; this is the backstop for the inline/local-dev path that has no
 * platform-level kill at all. */
export const PAY_DENTALLY_FETCH_HEARTBEAT_STALE_MS = 6 * 60 * 1000;

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
