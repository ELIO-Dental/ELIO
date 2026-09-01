import { describe, expect, it } from "vitest";
import { privatePatientsFooterTotals } from "./private-patients-table-format";

describe("private patients table helpers (Y2.5)", () => {
  it("computes footer totals from patient rows", () => {
    const totals = privatePatientsFooterTotals([
      {
        amountPence: 10000,
        amountPaidPence: 10000,
        amountOutstandingPence: 0,
        paymentStatus: "paid",
        durationMins: 60,
        isFinance: true,
        financeFeePence: 500,
      },
      {
        amountPence: 5000,
        amountPaidPence: 0,
        amountOutstandingPence: 5000,
        paymentStatus: "unpaid",
        durationMins: 30,
        isFinance: false,
        financeFeePence: null,
      },
    ]);

    expect(totals.paidTotalPence).toBe(10000);
    expect(totals.outstandingTotalPence).toBe(5000);
    expect(totals.totalMins).toBe(90);
    expect(totals.blendedHourlyPence).toBe(10000);
    expect(totals.financeCount).toBe(1);
    expect(totals.reviewCount).toBe(1);
  });
});
