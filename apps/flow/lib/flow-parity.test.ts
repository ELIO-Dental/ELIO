import { describe, expect, it } from "vitest";
import { compareFlowDashboardParity, parseLegacyFlowExportFile } from "./flow-parity";

describe("compareFlowDashboardParity", () => {
  const legacy = {
    totalConsultations: 10,
    attended: 8,
    converted: 3,
    stuck: 4,
    totalPipelineValue: 12000,
    totalPlanned: 45000,
    totalPaid: 8000,
    elioCareCount: 2,
    conversionRate: 38,
  };

  it("passes when counts and money match", () => {
    const result = compareFlowDashboardParity(legacy, {
      totalConsultations: 10,
      attended: 8,
      converted: 3,
      stuck: 4,
      totalPlannedPence: 4_500_000,
      totalPaidPence: 800_000,
      planSignUps: 2,
      conversionRate: 38,
    });
    expect(result.ok).toBe(true);
  });

  it("flags conversion count mismatch", () => {
    const result = compareFlowDashboardParity(legacy, {
      totalConsultations: 10,
      attended: 8,
      converted: 2,
      stuck: 4,
      totalPlannedPence: 4_500_000,
      totalPaidPence: 800_000,
      planSignUps: 2,
      conversionRate: 38,
    });
    expect(result.ok).toBe(false);
    expect(result.diffs.some((d) => d.field === "converted")).toBe(true);
  });
});

describe("parseLegacyFlowExportFile", () => {
  it("parses valid legacy stats JSON", () => {
    const file = parseLegacyFlowExportFile(
      JSON.stringify({
        stats: {
          totalConsultations: 5,
          attended: 4,
          converted: 2,
          stuck: 1,
          totalPipelineValue: 1000,
          totalPlanned: 5000,
          totalPaid: 500,
          elioCareCount: 1,
          conversionRate: 50,
        },
      })
    );
    expect(file.stats.totalConsultations).toBe(5);
  });

  it("rejects invalid export shape", () => {
    expect(() => parseLegacyFlowExportFile("{}")).toThrow(/Invalid legacy Flow export/);
  });
});
