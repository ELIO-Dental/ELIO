import { describe, expect, it } from "vitest";
import { labBillAmountsPenceFromPayslipJson } from "./lab-bills-period";
import { therapyDeductionPence, DEFAULT_THERAPY_RATE_PER_MINUTE } from "./private-revenue";

describe("labBillAmountsPenceFromPayslipJson", () => {
  it("returns null for missing json", () => {
    expect(labBillAmountsPenceFromPayslipJson(null)).toBeNull();
    expect(labBillAmountsPenceFromPayslipJson(undefined)).toBeNull();
  });

  it("converts AuraPay pound amounts to pence", () => {
    expect(labBillAmountsPenceFromPayslipJson([{ amount: 200 }])).toEqual([20000]);
  });

  it("returns empty array for empty list", () => {
    expect(labBillAmountsPenceFromPayslipJson([])).toEqual([]);
  });
});

describe("therapyDeductionPence", () => {
  it("uses default rate when minutes > 0 and rate missing", () => {
    expect(therapyDeductionPence(60, 0)).toBe(Math.round(60 * DEFAULT_THERAPY_RATE_PER_MINUTE * 100));
    expect(therapyDeductionPence(60, null)).toBe(Math.round(60 * DEFAULT_THERAPY_RATE_PER_MINUTE * 100));
  });

  it("returns 0 when minutes are 0", () => {
    expect(therapyDeductionPence(0, 1.5)).toBe(0);
  });
});
