import { describe, expect, it } from "vitest";
import { mergeFlowSettingsInput, parseFlowSettingsJson } from "./flow-settings";

describe("parseFlowSettingsJson", () => {
  it("returns defaults for empty input", () => {
    expect(parseFlowSettingsJson(null)).toEqual({
      planDisplayName: "AuraCare",
      cosmeticConsultReason: "cosmetic consultation",
      depositThresholdPence: 5000,
      paidConversionThresholdPence: 45000,
      appDisplayName: "",
      logoUrl: "",
    });
  });

  it("merges valid overrides", () => {
    expect(
      parseFlowSettingsJson({
        planDisplayName: "ElioCare",
        depositThresholdPence: 7500,
        appDisplayName: "Aura Flow",
        logoUrl: "https://cdn.example/logo.png",
      })
    ).toMatchObject({
      planDisplayName: "ElioCare",
      depositThresholdPence: 7500,
      paidConversionThresholdPence: 45000,
      appDisplayName: "Aura Flow",
      logoUrl: "https://cdn.example/logo.png",
    });
  });
});

describe("mergeFlowSettingsInput", () => {
  it("updates only provided fields", () => {
    const current = parseFlowSettingsJson(null);
    const merged = mergeFlowSettingsInput(current, {
      cosmeticConsultReason: "Smile Consultation",
      paidConversionThresholdPence: 50000,
    });
    expect(merged.cosmeticConsultReason).toBe("Smile Consultation");
    expect(merged.paidConversionThresholdPence).toBe(50000);
    expect(merged.planDisplayName).toBe("AuraCare");
  });
});
