import { describe, expect, it } from "vitest";
import { calculateFinalPay } from "@elio/pay-engine";
import {
  labBillsDeductionPence,
  normalizeSavePayslipEntryInput,
  sumLegacyAdjustmentsPence,
  totalsFromLegacyPatients,
} from "./save-payslip-entry";

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
    expect(finalPayPence).toBe(120 * 2810 + 50000 - 5000 - 3000 - 2000 - 1000 + 500);
  });
});

describe("normalizeSavePayslipEntryInput (Y2.1a legacy parity)", () => {
  it("maps legacy AuraPay field names to ELIO pence fields", () => {
    const input = normalizeSavePayslipEntryInput({
      id: "entry-1",
      gross_private: 1500.5,
      nhs_udas: 88,
      superannuation_deduction: 120.25,
      therapy_minutes: 30,
      therapy_rate: 0.5833,
      finance_fees: 40,
      notes: "Adjusted after review",
      adjustments: [
        { amount: 50, type: "addition" },
        { amount: 10, type: "deduction" },
      ],
      lab_bills: [{ amount: 200 }, { amount: 100 }],
      discrepancies: [{ type: "missing", note: "check log" }],
    });

    expect(input).toMatchObject({
      payslipEntryId: "entry-1",
      udas: 88,
      grossPrivateRevenuePence: 150050,
      superannuationPence: 12025,
      therapyMinutes: 30,
      therapyRatePerMinute: 0.5833,
      financeFeesPence: 4000,
      adjustmentReason: "Adjusted after review",
      manualAdjustmentsPence: 4000,
      labDeductionPence: 15000,
    });
    expect(input.dentallyDiscrepanciesJson).toEqual([{ type: "missing", note: "check log" }]);
  });

  it("derives gross private from legacy private_patients paid amounts", () => {
    const totals = totalsFromLegacyPatients([
      { amount: 500, amountPaid: 500, finance: false },
      { amount: 300, amountPaid: 200, finance: true, financeFee: 15 },
    ]);
    expect(totals.grossPrivateRevenuePence).toBe(70000);
    expect(totals.financeFeesPence).toBe(1500);
  });

  it("sums legacy adjustments in pence", () => {
    expect(sumLegacyAdjustmentsPence([{ amount: 25, type: "addition" }, { amount: 5, type: "deduction" }])).toBe(2000);
  });

  it("calculates lab bill deduction at 50%", () => {
    expect(labBillsDeductionPence([{ amount: 100 }, { amount: 50 }])).toBe(7500);
  });
});
