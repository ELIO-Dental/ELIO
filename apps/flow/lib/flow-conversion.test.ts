import { describe, expect, it } from "vitest";
import { isLegacyConverted } from "./flow-conversion";

describe("isLegacyConverted", () => {
  it("matches ACCEPTED outcome", () => {
    expect(
      isLegacyConverted({
        outcome: "ACCEPTED",
        hasDeposit: false,
        totalPaidPence: 0,
        treatmentBooked: false,
      })
    ).toBe(true);
  });

  it("does not treat planSignedUp / ElioCare alone as converted", () => {
    expect(
      isLegacyConverted({
        outcome: "DECLINED",
        planSignedUp: true,
        hasDeposit: false,
        totalPaidPence: 5000,
        treatmentBooked: false,
      })
    ).toBe(false);
  });

  it("converts when deposit + treatment booked", () => {
    expect(
      isLegacyConverted({
        outcome: null,
        hasDeposit: true,
        totalPaidPence: 5000,
        treatmentBooked: true,
      })
    ).toBe(true);
  });

  it("converts when paid >= £450 + treatment booked", () => {
    expect(
      isLegacyConverted({
        outcome: null,
        hasDeposit: false,
        totalPaidPence: 45_000,
        treatmentBooked: true,
      })
    ).toBe(true);
  });

  it("does not convert when paid enough but treatment not booked", () => {
    expect(
      isLegacyConverted({
        outcome: null,
        hasDeposit: true,
        totalPaidPence: 100_000,
        treatmentBooked: false,
      })
    ).toBe(false);
  });
});
