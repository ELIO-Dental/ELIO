import type { Prisma } from "@elio/db";

/** Extract lab bill amounts (pence) from payslip labBillsJson (AuraPay shape: amount in pounds). */
export function labBillAmountsPenceFromPayslipJson(labBillsJson: unknown): number[] | null {
  if (labBillsJson == null) return null;
  let arr: unknown[] = [];
  if (typeof labBillsJson === "string") {
    try {
      const parsed = JSON.parse(labBillsJson) as unknown;
      if (!Array.isArray(parsed)) return null;
      arr = parsed;
    } catch {
      return null;
    }
  } else if (Array.isArray(labBillsJson)) {
    arr = labBillsJson;
  } else {
    return null;
  }
  if (arr.length === 0) return [];
  return arr.map((item) => {
    const amount = typeof item === "object" && item && "amount" in item ? Number((item as { amount: unknown }).amount) : 0;
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    // AuraPay / payslip JSON stores pounds
    return Math.round(amount * 100);
  }).filter((n) => n > 0);
}

/** Prisma where clause for lab bills in a calendar month of a pay period. */
export function labBillPeriodWhere(
  dentistId: string,
  periodStart: Date
): Prisma.LabBillEntryWhereInput {
  const year = periodStart.getUTCFullYear();
  const month = periodStart.getUTCMonth(); // 0-based
  const rangeStart = new Date(Date.UTC(year, month, 1));
  const rangeEnd = new Date(Date.UTC(year, month + 1, 1));
  return {
    dentistId,
    OR: [
      { billDate: { gte: rangeStart, lt: rangeEnd } },
      { billDate: null, createdAt: { gte: rangeStart, lt: rangeEnd } },
    ],
  };
}
