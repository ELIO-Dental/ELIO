import { describe, expect, it } from "vitest";
import { calculateFinalPay } from "@elio/pay-engine";

/** Mirrors savePayslipEntry final-pay recalculation for PERCENTAGE_SPLIT (Y2.1a). */
describe("savePayslipEntry recalculation (Y2.1a)", () => {
  it("recomputes final pay from editable NHS/private deductions", () => {
    const finalPayPence = calculateFinalPay({
      payType: "PERCENTAGE_SPLIT",
      udas: 120,
      udaRatePence: 2810,
      grossPrivateRevenuePence: 100000,
      privateSplitPercent: 50,
      privateEarningsPence: 50000,
      consultationExclusionsPence: 0,
      labDeductionPence: 5000,
      superannuationPence: 3000,
      therapyDeductionPence: 2000,
      financeFeesDeductionPence: 1000,
      manualAdjustmentsPence: 500,
    });
    // NHS 120 * 2810 + private 50000 - deductions + adjustment
    expect(finalPayPence).toBe(120 * 2810 + 50000 - 5000 - 3000 - 2000 - 1000 + 500);
  });
});
