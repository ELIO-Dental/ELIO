/**
 * Step 37 — AuraPay home dashboard helpers.
 * Legacy stored integer month/year and labelled with:
 *   new Date(2000, month - 1).toLocaleString("en-GB", { month: "long" }) + " " + year
 */

/** Calendar month/year of a pay period (UTC date parts — matches stored [YYYY-MM-01, next)). */
export function payPeriodCalendarParts(periodStart: Date): { month: number; year: number } {
  return {
    month: periodStart.getUTCMonth() + 1,
    year: periodStart.getUTCFullYear(),
  };
}

/** AuraPay month name from 1–12 (local Date(2000, m-1) — same as legacy dashboard). */
export function auraPayMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleString("en-GB", { month: "long" });
}

/** e.g. May 2026 — same style as old AuraPay recent-period rows. */
export function formatPayPeriodMonthLabel(periodStart: Date): string {
  const { month, year } = payPeriodCalendarParts(periodStart);
  return `${auraPayMonthName(month)} ${year}`;
}

/**
 * Three-letter month badge — AuraPay used `monthName(m).substring(0, 3)`
 * (e.g. September → Sep, not Intl short “Sept”).
 */
export function formatPayPeriodMonthShort(periodStart: Date): string {
  const { month } = payPeriodCalendarParts(periodStart);
  return auraPayMonthName(month).substring(0, 3);
}

/** Legacy used Finalized / Draft; ELIO stores LOCKED / DRAFT. */
export function formatPayPeriodStatusLabel(status: string): "Finalized" | "Draft" {
  return status === "LOCKED" ? "Finalized" : "Draft";
}

/**
 * Old AuraPay periods were unique per month/year. Deduplicate by calendar month
 * (keep first = latest periodStart, then newest created among ties).
 */
export function uniqueRecentPeriodsByMonth<T extends { periodStart: Date }>(
  periods: T[],
  take: number
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of periods) {
    const { month, year } = payPeriodCalendarParts(p.periodStart);
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= take) break;
  }
  return out;
}
