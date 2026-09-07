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
 * Prefer the AuraPay-canonical row for a calendar month when duplicates exist:
 * most payslips (real work), then LOCKED (Finalized) over DRAFT, then oldest createdAt.
 */
export function preferCanonicalPayPeriod<
  T extends {
    periodStart: Date;
    status?: string;
    createdAt?: Date;
    payslipCount?: number;
  },
>(a: T, b: T): number {
  const aPayslips = a.payslipCount ?? 0;
  const bPayslips = b.payslipCount ?? 0;
  if (aPayslips !== bPayslips) return bPayslips - aPayslips;
  const aLocked = a.status === "LOCKED" ? 0 : 1;
  const bLocked = b.status === "LOCKED" ? 0 : 1;
  if (aLocked !== bLocked) return aLocked - bLocked;
  const aT = a.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const bT = b.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
  return aT - bT;
}

/**
 * Old AuraPay periods were unique per month/year. Deduplicate by calendar month
 * (newer months first; within a month keep the canonical row).
 */
export function uniqueRecentPeriodsByMonth<
  T extends {
    periodStart: Date;
    status?: string;
    createdAt?: Date;
    payslipCount?: number;
  },
>(periods: T[], take: number): T[] {
  const sorted = [...periods].sort((a, b) => {
    const aParts = payPeriodCalendarParts(a.periodStart);
    const bParts = payPeriodCalendarParts(b.periodStart);
    const aKey = aParts.year * 12 + aParts.month;
    const bKey = bParts.year * 12 + bParts.month;
    if (aKey !== bKey) return bKey - aKey;
    return preferCanonicalPayPeriod(a, b);
  });

  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of sorted) {
    const { month, year } = payPeriodCalendarParts(p.periodStart);
    const key = `${year}-${month}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= take) break;
  }
  return out;
}
