import { describe, expect, it } from "vitest";
import { resolveDentistRatesAsOf, resolveShareBp, periodRatesAsOfDate } from "./dentist-rates";

describe("dentist-rates (Step 21)", () => {
  const current = {
    privateSplitPercent: 50,
    udaRatePence: 1600,
    hourlyRatePence: null,
    labShareBp: null,
    financeShareBp: null,
    therapyHourlyPence: null,
  };

  it("uses current when no history", () => {
    const r = resolveDentistRatesAsOf(current, [], new Date("2026-06-30"));
    expect(r.privateSplitPercent).toBe(50);
    expect(r.udaRatePence).toBe(1600);
  });

  it("picks version effective on/before period end (March old / June new)", () => {
    const history = [
      {
        effectiveFrom: new Date("2026-01-01"),
        privateSplitPercent: 45,
        udaRatePence: 1500,
        hourlyRatePence: null,
        labShareBp: 5000,
        financeShareBp: 5000,
        therapyHourlyPence: null,
      },
      {
        effectiveFrom: new Date("2026-05-01"),
        privateSplitPercent: 50,
        udaRatePence: 1600,
        hourlyRatePence: null,
        labShareBp: 5000,
        financeShareBp: 5000,
        therapyHourlyPence: null,
      },
    ];
    const march = resolveDentistRatesAsOf(current, history, new Date("2026-03-31"));
    expect(march.privateSplitPercent).toBe(45);
    expect(march.udaRatePence).toBe(1500);
    const june = resolveDentistRatesAsOf(current, history, new Date("2026-06-30"));
    expect(june.privateSplitPercent).toBe(50);
    expect(june.udaRatePence).toBe(1600);
  });

  it("periodRatesAsOfDate uses last inclusive day of half-open period", () => {
    // May period stored as end = 2026-06-01 exclusive → as-of is 2026-05-31 23:59:59.999
    const asOf = periodRatesAsOfDate(new Date("2026-06-01T00:00:00.000Z"));
    expect(asOf.toISOString()).toBe("2026-05-31T23:59:59.999Z");
    const history = [
      {
        effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
        privateSplitPercent: 99,
        udaRatePence: 9999,
        hourlyRatePence: null,
        labShareBp: null,
        financeShareBp: null,
        therapyHourlyPence: null,
      },
      {
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        privateSplitPercent: 50,
        udaRatePence: 1600,
        hourlyRatePence: null,
        labShareBp: null,
        financeShareBp: null,
        therapyHourlyPence: null,
      },
    ];
    const may = resolveDentistRatesAsOf(current, history, asOf);
    expect(may.privateSplitPercent).toBe(50);
  });

  it("falls back to practice share when dentist override null", () => {
    expect(resolveShareBp(null, 5000)).toBe(5000);
    expect(resolveShareBp(6000, 5000)).toBe(6000);
  });
});
