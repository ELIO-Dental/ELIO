import { describe, expect, it } from "vitest";
import { computePayslipExpandedMetrics } from "./payslip-expanded-metrics";

describe("payslip expanded metrics (Y2.4)", () => {
  it("sums deduction lines for total deductions card", () => {
    const metrics = computePayslipExpandedMetrics({
      grossPrivateRevenuePence: 100000,
      privateEarningsPence: 50000,
      nhsEarningsPence: 20000,
      labDeductionPence: 5000,
      superannuationPence: 3000,
      therapyMinutes: 30,
      therapyRatePerMinute: 1.5,
      financeLines: [{ financeFeePence: 2000 }],
    });

    expect(metrics.grossPrivatePence).toBe(100000);
    expect(metrics.netPrivatePence).toBe(50000);
    expect(metrics.nhsIncomePence).toBe(20000);
    expect(metrics.therapyDeductionPence).toBe(4500);
    expect(metrics.financeFeesDeductionPence).toBe(1000);
    expect(metrics.totalDeductionsPence).toBe(13500);
  });
});
