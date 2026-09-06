/**
 * Pure helpers for Step 3 patient-cache / appointment-history memoization.
 * Kept free of Dentally I/O so unit tests do not need network mocks for the cache contract.
 */

/**
 * Deduplicate patient ids for a fetch run.
 * Optional `max` is only for tests/ops emergency throttle — production fetch omits it
 * so every distinct patient gets a name (Step 6b).
 */
export function uniquePatientIdsForFetch(patientIds: string[], max?: number): string[] {
  const unique = Array.from(new Set(patientIds.filter(Boolean)));
  if (max != null && Number.isFinite(max) && max >= 0) {
    return unique.slice(0, Math.floor(max));
  }
  return unique;
}

/**
 * Run async work over items with a fixed concurrency pool (Dentally rate-limit friendly).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i] as T, i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Memoize async work by patient id — second call with same id must not invoke factory.
 */
export async function withPatientCache<T>(
  cache: Map<string, T>,
  patientId: string,
  factory: () => Promise<T>
): Promise<T> {
  const hit = cache.get(patientId);
  if (hit !== undefined) return hit;
  const value = await factory();
  cache.set(patientId, value);
  return value;
}

/** Filter prior appointments dated on/before therapy date (in-memory after one Dentally pull). */
export function filterAppointmentsOnOrBefore<
  T extends { starts_at?: string | null; start_time?: string | null },
>(history: T[], aptDate: string): T[] {
  return history.filter((prior) => {
    const d = (prior.starts_at || prior.start_time || "").substring(0, 10);
    return Boolean(d && d <= aptDate);
  });
}
