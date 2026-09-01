import { describe, expect, it } from "vitest";

/** Footer totals for private patients table (Y2.5). */
export function privatePatientsFooterTotals(
  lines: Array<{
    amountPence: number;
    amountPaidPence: number | null;
    amountOutstandingPence: number | null;
    paymentStatus: string | null;
    durationMins: number | null;
    isFinance: boolean;
    financeFeePence: number | null;
  }>
) {
  const paidTotalPence = lines.reduce(
    (sum, l) => sum + (l.amountPaidPence ?? (l.paymentStatus === "paid" ? l.amountPence : 0)),
    0
  );
  const outstandingTotalPence = lines.reduce((sum, l) => sum + (l.amountOutstandingPence ?? 0), 0);
  const totalMins = lines.reduce((sum, l) => sum + (l.durationMins ?? 0), 0);
  const totalAmountPence = lines.reduce((sum, l) => sum + l.amountPence, 0);
  const blendedHourlyPence = totalMins > 0 ? Math.round(totalAmountPence / (totalMins / 60)) : null;
  const financeCount = lines.filter((l) => l.isFinance).length;
  const financeFeeTotalPence = lines.reduce((sum, l) => sum + (l.financeFeePence ?? 0), 0);

  return {
    paidTotalPence,
    outstandingTotalPence,
    totalMins,
    totalAmountPence,
    blendedHourlyPence,
    financeCount,
    financeFeeTotalPence,
    paidCount: lines.filter((l) => l.paymentStatus === "paid").length,
    reviewCount: lines.filter((l) => l.paymentStatus && l.paymentStatus !== "paid").length,
  };
}
