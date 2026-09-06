import { describe, expect, it } from "vitest";
import { dentistHasNhs, resolveNhsUdasForCalc } from "./nhs-udas";

describe("nhs-udas (Step 19)", () => {
  it("detects NHS via performer number", () => {
    expect(dentistHasNhs({ nhsPerformerNumber: "123456" })).toBe(true);
    expect(dentistHasNhs({ nhsPerformerNumber: "  " })).toBe(false);
    expect(dentistHasNhs({ nhsPerformerNumber: null })).toBe(false);
  });

  it("zeros NHS income for non-NHS dentists even if UDAs present", () => {
    expect(resolveNhsUdasForCalc({ nhsPerformerNumber: null, udaRatePence: 1600 }, 100)).toEqual({
      udas: 0,
      udaRatePence: 0,
      nhsEarningsPence: 0,
    });
  });

  it("computes nhs income for NHS dentists", () => {
    expect(resolveNhsUdasForCalc({ nhsPerformerNumber: "P1", udaRatePence: 1600 }, 10)).toEqual({
      udas: 10,
      udaRatePence: 1600,
      nhsEarningsPence: 16000,
    });
  });
});
