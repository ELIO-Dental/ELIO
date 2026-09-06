import { describe, expect, it } from "vitest";
import { resolveFinanceFeeSplit, resolveLabBillSplit, defaultPaySettings, mergePaySettingsInput } from "./pay-settings";

describe("pay settings calculation splits (Y3.5 / Step 20)", () => {
  it("resolves lab and finance splits as basis points (5000 = 50%)", () => {
    const settings = defaultPaySettings();
    expect(resolveLabBillSplit(settings)).toBe(5000);
    expect(resolveFinanceFeeSplit(settings)).toBe(5000);
  });

  it("respects custom splits from settings", () => {
    const settings = mergePaySettingsInput(defaultPaySettings(), {
      lab_bill_split: "0.6",
      finance_fee_split: "0.4",
    });
    expect(resolveLabBillSplit(settings)).toBe(6000);
    expect(resolveFinanceFeeSplit(settings)).toBe(4000);
  });
});
