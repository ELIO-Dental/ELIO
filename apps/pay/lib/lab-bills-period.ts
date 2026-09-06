import type { Prisma } from "@elio/db";
import type { PayslipLabBill } from "./payslip-editable-fields";

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
  return arr
    .map((item) => {
      const amount =
        typeof item === "object" && item && "amount" in item
          ? Number((item as { amount: unknown }).amount)
          : 0;
      if (!Number.isFinite(amount) || amount <= 0) return 0;
      // AuraPay / payslip JSON stores pounds
      return Math.round(amount * 100);
    })
    .filter((n) => n > 0);
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

/** Map LabBillEntry rows → payslip JSON (pounds + optional link). Step 15. */
export function labBillEntriesToPayslipJson(
  entries: Array<{
    labName?: string | null;
    amountPence: number;
    description?: string | null;
    fileUrl?: string | null;
  }>
): PayslipLabBill[] {
  return entries
    .filter((e) => e.amountPence > 0)
    .map((e) => ({
      lab_name: (e.labName ?? "").trim() || "Lab",
      amount: Math.round(e.amountPence) / 100,
      description: e.description?.trim() || undefined,
      file_url: e.fileUrl?.trim() || undefined,
    }));
}

/** Share of total lab bills (pence) — shareBp (5000 = 50%); legacy float ≤1 accepted. */
export function labShareDeductionPence(amountsPence: number[], shareBp: number): number {
  const total = amountsPence.reduce((s, n) => s + n, 0);
  const bp = shareBp <= 1 ? Math.round(shareBp * 10_000) : Math.round(shareBp);
  return Math.round((total * bp) / 10_000);
}
