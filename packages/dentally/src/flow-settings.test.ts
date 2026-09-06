import { describe, expect, it } from "vitest";
import { mergeFlowSettingsInput, parseFlowSettingsJson, resolveFlowBrandTitle } from "./flow-settings";

describe("parseFlowSettingsJson", () => {
  it("returns defaults for empty input", () => {
    expect(parseFlowSettingsJson(null)).toEqual({
      planDisplayName: "AuraCare",
      cosmeticConsultReason: "cosmetic consultation",
      depositThresholdPence: 5000,
      paidConversionThresholdPence: 45000,
      appDisplayName: "",
      logoUrl: "",
      companyName: "",
      primaryColor: "",
    });
  });

  it("merges valid overrides", () => {
    expect(
      parseFlowSettingsJson({
        planDisplayName: "ElioCare",
        depositThresholdPence: 7500,
        appDisplayName: "Aura Flow",
        logoUrl: "https://cdn.example/logo.png",
        companyName: "Aura Dental",
        primaryColor: "#3b82f6",
      })
    ).toMatchObject({
      planDisplayName: "ElioCare",
      depositThresholdPence: 7500,
      paidConversionThresholdPence: 45000,
      appDisplayName: "Aura Flow",
      logoUrl: "https://cdn.example/logo.png",
      companyName: "Aura Dental",
      primaryColor: "#3b82f6",
    });
  });
});

describe("mergeFlowSettingsInput", () => {
  it("updates only provided fields", () => {
    const current = parseFlowSettingsJson(null);
    const merged = mergeFlowSettingsInput(current, {
      cosmeticConsultReason: "Smile Consultation",
      paidConversionThresholdPence: 50000,
      companyName: "Aura Dental Clinic",
      primaryColor: "#0891b2",
    });
    expect(merged.cosmeticConsultReason).toBe("Smile Consultation");
    expect(merged.paidConversionThresholdPence).toBe(50000);
    expect(merged.planDisplayName).toBe("AuraCare");
    expect(merged.companyName).toBe("Aura Dental Clinic");
    expect(merged.primaryColor).toBe("#0891b2");
  });
});

describe("resolveFlowBrandTitle", () => {
  it("prefers custom app name over practice name", () => {
    expect(resolveFlowBrandTitle({ appDisplayName: "Aura Flow" }, "Seed Practice")).toBe("Aura Flow");
  });

  it("falls back to practice name then default", () => {
    expect(resolveFlowBrandTitle({ appDisplayName: "" }, "Aura Dental")).toBe("Aura Dental");
    expect(resolveFlowBrandTitle({ appDisplayName: "" }, "")).toBe("ELIO FLOW");
  });
});
