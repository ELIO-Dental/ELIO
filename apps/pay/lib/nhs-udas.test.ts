import { describe, expect, it } from "vitest";
import { dentistHasNhs, resolveNhsUdasForCalc } from "./nhs-udas";

describe("nhs-udas (Step 19)", () => {
  it("prefers explicit isNhs flag over performer number", () => {
    expect(dentistHasNhs({ isNhs: true, nhsPerformerNumber: null })).toBe(true);
    expect(dentistHasNhs({ isNhs: false, nhsPerformerNumber: "123456" })).toBe(false);
  });

  it("falls back to performer number when isNhs is unset", () => {
    expect(dentistHasNhs({ nhsPerformerNumber: "123456" })).toBe(true);
    expect(dentistHasNhs({ nhsPerformerNumber: "  " })).toBe(false);
    expect(dentistHasNhs({ nhsPerformerNumber: null })).toBe(false);
  });

  it("zeros NHS income for non-NHS dentists even if UDAs present", () => {
    expect(resolveNhsUdasForCalc({ isNhs: false, udaRatePence: 1600 }, 100)).toEqual({
      udas: 0,
      udaRatePence: 0,
      nhsEarningsPence: 0,
    });
  });

  it("computes nhs income for NHS dentists", () => {
    expect(resolveNhsUdasForCalc({ isNhs: true, udaRatePence: 1600 }, 10)).toEqual({
      udas: 10,
      udaRatePence: 1600,
      nhsEarningsPence: 16000,
    });
  });
});
