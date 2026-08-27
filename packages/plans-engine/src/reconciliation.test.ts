import { describe, it, expect } from "vitest";
import { chargeWindowForPeriod } from "./reconciliation";

describe("chargeWindowForPeriod", () => {
  it("returns the first and last day of a 31-day month", () => {
    expect(chargeWindowForPeriod("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("returns the first and last day of a 30-day month", () => {
    expect(chargeWindowForPeriod("2026-06")).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("handles February in a leap year", () => {
    expect(chargeWindowForPeriod("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("handles February in a non-leap year", () => {
    expect(chargeWindowForPeriod("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("rejects a malformed period", () => {
    expect(() => chargeWindowForPeriod("2026-2")).toThrow(/Invalid billing period/);
    expect(() => chargeWindowForPeriod("not-a-period")).toThrow(/Invalid billing period/);
  });
});
