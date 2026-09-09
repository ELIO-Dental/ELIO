import { describe, expect, it } from "vitest";
import {
  dentallyPriorLinesWhere,
  dentallyReplaceLineWhere,
  percentageDentistsNeedingEmptyClear,
} from "./dentally-fetch-replace";

describe("dentally-fetch-replace", () => {
  it("deletes only non-MANUAL lines (preserves plugs)", () => {
    expect(dentallyReplaceLineWhere("ps-1")).toEqual({
      payslipEntryId: "ps-1",
      sourceType: { not: "MANUAL" },
    });
    expect(dentallyPriorLinesWhere("ps-1")).toEqual(dentallyReplaceLineWhere("ps-1"));
  });

  it("lists percentage dentists missing from fetch result for stale clear", () => {
    const dentists = [
      { id: "a", payType: "PERCENTAGE_SPLIT" },
      { id: "b", payType: "PERCENTAGE_SPLIT" },
      { id: "h", payType: "HOURLY" },
    ];
    expect(percentageDentistsNeedingEmptyClear(dentists, ["a"])).toEqual(["b"]);
    expect(percentageDentistsNeedingEmptyClear(dentists, ["a", "b"])).toEqual([]);
    expect(percentageDentistsNeedingEmptyClear(dentists, [])).toEqual(["a", "b"]);
  });
});
