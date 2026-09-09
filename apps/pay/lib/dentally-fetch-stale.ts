/** Stuck RUNNING recovery for pay-period Dentally fetch jobs. */

/** 45m — month-scoped fetch should finish well under this; longer = dead after()/crash. */
export const PAY_DENTALLY_FETCH_STALE_MS = 45 * 60 * 1000;

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
