import { describe, expect, it } from "vitest";
import {
  GOLDEN_MONTH_DENTISTS,
  computeGoldenDentistFinalPayPence,
  goldenMonthPeriodTotalsPence,
} from "./golden-month";
import { canRunPeriodCalculation } from "./month-pipeline";

describe("golden-month parity pack (Step 35)", () => {
  it("matches expected final pay per dentist penny-exact", () => {
    for (const d of GOLDEN_MONTH_DENTISTS) {
      expect(computeGoldenDentistFinalPayPence(d), d.name).toBe(d.expectedFinalPayPence);
    }
  });

  it("period totals are stable (idempotent recompute)", () => {
    const a = goldenMonthPeriodTotalsPence();
    const b = goldenMonthPeriodTotalsPence();
    expect(a).toEqual(b);
    expect(a.total).toBe(307_900 + 105_500);
    expect(a.byDentist["gd-alpha"]).toBe(307_900);
    expect(a.byDentist["gd-beta"]).toBe(105_500);
  });

  it("pipeline still forbids calc during fetch (Step 34 glue)", () => {
    expect(canRunPeriodCalculation({ periodStatus: "DRAFT", dentallyFetchStatus: "RUNNING" }).ok).toBe(
      false
    );
  });
});
