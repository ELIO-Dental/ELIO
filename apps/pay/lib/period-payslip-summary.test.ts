import { describe, expect, it } from "vitest";
import {
  buildPeriodPayslipSummaryRow,
  formatDecimalLabel,
} from "./period-payslip-summary";

describe("period payslip summary (Step 24)", () => {
  it("formats decimals without raw Decimal noise", () => {
    expect(formatDecimalLabel(50)).toBe("50");
    expect(formatDecimalLabel(50.5, "%")).toBe("50.5%");
    expect(formatDecimalLabel(null)).toBe("—");
  });

  it("row totals match payslip stored fields + computed deductions", () => {
    const row = buildPeriodPayslipSummaryRow({
      id: "ps-1",
      dentistName: "Dr Test",
      payType: "PERCENTAGE_SPLIT",
      udas: 10,
      privateSplitPercent: 50,
      nhsEarningsPence: 20000,
      grossPrivateRevenuePence: 100000,
      privateEarningsPence: 50000,
      labDeductionPence: 10000,
      superannuationPence: 0,
      therapyMinutes: 60,
      therapyRatePerMinute: null,
      financeLines: [{ financeFeePence: 8000 }],
      financeShareBp: 5000,
      practiceFinanceBp: 5000,
      manualAdjustmentsPence: 1000,
      finalPayPence: 33500,
      provisional: true,
    });

    expect(row.udasLabel).toBe("10");
    expect(row.splitPercentLabel).toBe("50%");
    expect(row.nhsIncomePence).toBe(20000);
    expect(row.grossPence).toBe(100000);
    expect(row.netPrivatePence).toBe(50000);
    expect(row.labDeductionPence).toBe(10000);
    expect(row.financeDeductionPence).toBe(4000);
    expect(row.therapyDeductionPence).toBe(3500);
    expect(row.adjustmentsPence).toBe(1000);
    expect(row.totalPaymentPence).toBe(33500);
    expect(row.provisional).toBe(true);
  });

  it("uses dentist finance share override", () => {
    const row = buildPeriodPayslipSummaryRow({
      id: "ps-2",
      dentistName: "Dr Override",
      payType: "PERCENTAGE_SPLIT",
      udas: null,
      privateSplitPercent: 45,
      nhsEarningsPence: 0,
      grossPrivateRevenuePence: 0,
      privateEarningsPence: 0,
      labDeductionPence: 0,
      superannuationPence: 0,
      therapyMinutes: null,
      therapyRatePerMinute: null,
      financeLines: [{ financeFeePence: 10000 }],
      financeShareBp: 6000,
      practiceFinanceBp: 5000,
      manualAdjustmentsPence: 0,
      finalPayPence: 0,
      provisional: false,
    });
    expect(row.financeDeductionPence).toBe(6000);
  });
});
