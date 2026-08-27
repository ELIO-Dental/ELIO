/**
 * Pay-run period boundary calculation — BUG-2 fix (project-docs/00_SCOPE.md section 4).
 *
 * PORTED UNCHANGED from ElioPay/aurapay/src/lib/period.ts (Step 0.4) into the monorepo
 * per Step 1.6's requirement to preserve the fix exactly. Do not "improve" this file —
 * any change here must be re-verified against the original 15/15 BUG-2 test suite.
 *
 * The pay period is the exact calendar month in the practice's timezone (Europe/London):
 * a half-open interval [00:00 on the 1st, 00:00 on the 1st of next month).
 *
 * Deliberately implemented as plain zero-padded "YYYY-MM-DD" string arithmetic on the
 * integer month/year — never via `new Date(y, m, d)` + `.toISOString()`, which silently
 * reinterprets the date through the JS runtime's local/UTC offset and is exactly what
 * produces rolling-30-day-window and UTC-boundary bugs across a BST/GMT clock change.
 * Comparing date-only strings (`"2026-06-16" >= "2026-06-01"`) is timezone-proof by
 * construction — there is no instant/offset conversion for a DST transition to corrupt.
 */

export interface PayPeriodBoundaries {
  /** Inclusive lower bound, "YYYY-MM-DD", the 1st of the period month. */
  startDate: string;
  /** Exclusive upper bound, "YYYY-MM-DD", the 1st of the NEXT month. */
  endDate: string;
}

/**
 * Returns the half-open [startDate, endDate) calendar-month boundary for a pay period.
 * @param month 1-12
 * @param year e.g. 2026
 */
export function getPayPeriodBoundaries(month: number, year: number): PayPeriodBoundaries {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`getPayPeriodBoundaries: invalid month ${month} (must be 1-12)`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error(`getPayPeriodBoundaries: invalid year ${year}`);
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;

  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

  return { startDate, endDate };
}

/**
 * Half-open interval membership test: [startDate, endDate).
 * `dateStr` must be a "YYYY-MM-DD"-prefixed string (an ISO datetime is fine — only the
 * first 10 characters are compared, so a time-of-day component never affects the result).
 */
export function isDateInPeriod(dateStr: string | null | undefined, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  const d = dateStr.substring(0, 10);
  return d >= startDate && d < endDate;
}

/**
 * The 15th-of-the-month payroll TRIGGER pays for the PREVIOUS exact calendar month
 * (APPLICATION_FLOW.md §6.0 — e.g. a run on 15th July pays for 1-31 June).
 * `triggerDate` is a "YYYY-MM-DD"-prefixed string (today's date, in practice-local terms).
 */
export function getPeriodForTriggerDate(triggerDate: string): PayPeriodBoundaries {
  const year = Number(triggerDate.substring(0, 4));
  const month = Number(triggerDate.substring(5, 7));
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return getPayPeriodBoundaries(prevMonth, prevYear);
}
