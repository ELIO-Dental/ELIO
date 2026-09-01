import { describe, expect, it } from "vitest";
import { resolveFinanceFeeSplit, resolveLabBillSplit, defaultPaySettings, mergePaySettingsInput } from "./pay-settings";

describe("pay settings calculation splits (Y3.5)", () => {
  it("resolves lab and finance splits with defaults", () => {
    const settings = defaultPaySettings();
    expect(resolveLabBillSplit(settings)).toBe(0.5);
    expect(resolveFinanceFeeSplit(settings)).toBe(0.5);
  });

  it("respects custom splits from settings", () => {
    const settings = mergePaySettingsInput(defaultPaySettings(), {
      lab_bill_split: "0.6",
      finance_fee_split: "0.4",
    });
    expect(resolveLabBillSplit(settings)).toBe(0.6);
    expect(resolveFinanceFeeSplit(settings)).toBe(0.4);
  });
});
