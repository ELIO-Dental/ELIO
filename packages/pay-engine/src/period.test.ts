import { describe, it, expect } from "vitest";
import { getPayPeriodBoundaries, isDateInPeriod, getPeriodForTriggerDate } from "./period";

// BUG-2 acceptance criteria (project-docs/00_SCOPE.md section 4), ported unchanged from
// ElioPay/aurapay/src/lib/period.test.ts — pay period = calendar month in Europe/London,
// half-open interval [00:00 on the 1st, 00:00 on the 1st of next month).

describe("getPayPeriodBoundaries — BUG-2 fix", () => {
  it("28-day month (Feb, non-leap 2026)", () => {
    expect(getPayPeriodBoundaries(2, 2026)).toEqual({ startDate: "2026-02-01", endDate: "2026-03-01" });
  });

  it("29-day month (Feb, leap 2028)", () => {
    expect(getPayPeriodBoundaries(2, 2028)).toEqual({ startDate: "2028-02-01", endDate: "2028-03-01" });
  });

  it("30-day month (June)", () => {
    expect(getPayPeriodBoundaries(6, 2026)).toEqual({ startDate: "2026-06-01", endDate: "2026-07-01" });
  });

  it("31-day month (July)", () => {
    expect(getPayPeriodBoundaries(7, 2026)).toEqual({ startDate: "2026-07-01", endDate: "2026-08-01" });
  });

  it("December rolls over to next year", () => {
    expect(getPayPeriodBoundaries(12, 2026)).toEqual({ startDate: "2026-12-01", endDate: "2027-01-01" });
  });

  it("BST->GMT clock-change month (October) — boundary is still the 1st, DST-blind by design", () => {
    expect(getPayPeriodBoundaries(10, 2026)).toEqual({ startDate: "2026-10-01", endDate: "2026-11-01" });
  });

  it("GMT->BST clock-change month (March) — boundary is still the 1st, DST-blind by design", () => {
    expect(getPayPeriodBoundaries(3, 2026)).toEqual({ startDate: "2026-03-01", endDate: "2026-04-01" });
  });

  it("rejects an invalid month", () => {
    expect(() => getPayPeriodBoundaries(13, 2026)).toThrow();
    expect(() => getPayPeriodBoundaries(0, 2026)).toThrow();
  });

  it("is deterministic — re-running the same historic month returns identical boundaries", () => {
    const first = getPayPeriodBoundaries(6, 2026);
    const second = getPayPeriodBoundaries(6, 2026);
    expect(first).toEqual(second);
  });
});

describe("isDateInPeriod — half-open interval membership (June 2026)", () => {
  const { startDate, endDate } = getPayPeriodBoundaries(6, 2026); // 2026-06-01 .. 2026-07-01

  it("includes an item timestamped 00:00:00 on the 1st of the period month", () => {
    expect(isDateInPeriod("2026-06-01T00:00:00.000Z", startDate, endDate)).toBe(true);
  });

  it("includes an item timestamped 23:59:59 on the LAST day of the month", () => {
    expect(isDateInPeriod("2026-06-30T23:59:59.999Z", startDate, endDate)).toBe(true);
  });

  it("EXCLUDES an item timestamped 00:00:00 on the 1st of the NEXT month", () => {
    expect(isDateInPeriod("2026-07-01T00:00:00.000Z", startDate, endDate)).toBe(false);
  });

  it("excludes an item from the previous month", () => {
    expect(isDateInPeriod("2026-05-31T23:59:59.999Z", startDate, endDate)).toBe(false);
  });

  it("handles a bare YYYY-MM-DD date string (no time component) the same way", () => {
    expect(isDateInPeriod("2026-06-01", startDate, endDate)).toBe(true);
    expect(isDateInPeriod("2026-07-01", startDate, endDate)).toBe(false);
  });

  it("returns false for a missing/empty date", () => {
    expect(isDateInPeriod(undefined, startDate, endDate)).toBe(false);
    expect(isDateInPeriod(null, startDate, endDate)).toBe(false);
    expect(isDateInPeriod("", startDate, endDate)).toBe(false);
  });
});

describe("getPeriodForTriggerDate — §6.0 cadence (15th pays for previous calendar month)", () => {
  it("15th July triggers payroll for 1-30 June", () => {
    expect(getPeriodForTriggerDate("2026-07-15")).toEqual({ startDate: "2026-06-01", endDate: "2026-07-01" });
  });

  it("15th January triggers payroll for previous December (year rollover)", () => {
    expect(getPeriodForTriggerDate("2026-01-15")).toEqual({ startDate: "2025-12-01", endDate: "2026-01-01" });
  });
});
