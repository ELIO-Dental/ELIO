import { describe, expect, it } from "vitest";
import {
  calculateLegacyAuraPayNetPayPence,
  compareNetPayParity,
  comparePeriodPayParity,
  DEFAULT_PAY_PARITY_TOLERANCE_PENCE,
} from "./pay-period-parity";

describe("pay-period-parity (Y4.2)", () => {
  it("calculates legacy net pay using AuraPay reporting formula", () => {
    const netPence = calculateLegacyAuraPayNetPayPence({
      grossPrivatePounds: 10000,
      splitPercent: 50,
      isNhs: true,
      nhsUdas: 100,
      udaRatePounds: 28.1,
      labBillsJson: JSON.stringify([{ amount: 200 }]),
      financeFeesPounds: 100,
      therapyMinutes: 60,
      therapyRatePerMinute: 0.5833,
      superannuationPounds: 50,
      adjustmentsJson: JSON.stringify([{ amount: 25, type: "addition" }]),
    });
    // 5000 private + 2810 NHS - 100 lab - 50 finance - 34.998 therapy - 50 super + 25 adj
    expect(netPence).toBe(760000);
  });

  it("accepts net pay within ±£1 tolerance", () => {
    const result = compareNetPayParity(500000, 500050, DEFAULT_PAY_PARITY_TOLERANCE_PENCE);
    expect(result.withinTolerance).toBe(true);
    expect(result.diffPence).toBe(50);
  });

  it("rejects net pay outside ±£1 tolerance", () => {
    const result = compareNetPayParity(500000, 501500, DEFAULT_PAY_PARITY_TOLERANCE_PENCE);
    expect(result.withinTolerance).toBe(false);
  });

  it("compares a full period by dentist name", () => {
    const result = comparePeriodPayParity(
      [
        { dentistName: "Dr A", netPayPounds: 5000 },
        { dentistName: "Dr B", netPayPounds: 3200.5 },
      ],
      [
        { dentistName: "Dr A", finalPayPence: 500050 },
        { dentistName: "Dr B", finalPayPence: 320040 },
      ]
    );
    expect(result.ok).toBe(true);
    expect(result.matched).toHaveLength(2);
    expect(result.missingInNew).toHaveLength(0);
    expect(result.missingInLegacy).toHaveLength(0);
  });

  it("reports dentists missing on either side", () => {
    const result = comparePeriodPayParity(
      [{ dentistName: "Dr A", netPayPounds: 1000 }],
      [{ dentistName: "Dr B", finalPayPence: 100000 }]
    );
    expect(result.ok).toBe(false);
    expect(result.missingInNew).toEqual(["Dr A"]);
    expect(result.missingInLegacy).toEqual(["Dr B"]);
  });
});
