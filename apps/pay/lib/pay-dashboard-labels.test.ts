import { describe, expect, it } from "vitest";
import {
  formatPayPeriodMonthLabel,
  formatPayPeriodMonthShort,
  formatPayPeriodStatusLabel,
  uniqueRecentPeriodsByMonth,
} from "./pay-dashboard-labels";

describe("pay-dashboard-labels (Step 37 / AuraPay home)", () => {
  it("formats month labels like legacy AuraPay (integer month names)", () => {
    const may = new Date("2026-05-01T00:00:00.000Z");
    const sep = new Date("2026-09-01T00:00:00.000Z");
    const aug = new Date("2026-08-01T00:00:00.000Z");
    expect(formatPayPeriodMonthLabel(may)).toBe("May 2026");
    expect(formatPayPeriodMonthShort(may)).toBe("May");
    expect(formatPayPeriodMonthLabel(sep)).toBe("September 2026");
    expect(formatPayPeriodMonthShort(sep)).toBe("Sep");
    expect(formatPayPeriodMonthLabel(aug)).toBe("August 2026");
  });

  it("maps LOCKED → Finalized and DRAFT → Draft", () => {
    expect(formatPayPeriodStatusLabel("LOCKED")).toBe("Finalized");
    expect(formatPayPeriodStatusLabel("DRAFT")).toBe("Draft");
  });

  it("dedupes recent periods to one row per calendar month (AuraPay unique month/year)", () => {
    const rows = [
      { id: "a", periodStart: new Date("2026-09-01T00:00:00.000Z") },
      { id: "b", periodStart: new Date("2026-09-01T00:00:00.000Z") },
      { id: "c", periodStart: new Date("2026-08-01T00:00:00.000Z") },
      { id: "d", periodStart: new Date("2026-07-01T00:00:00.000Z") },
    ];
    const unique = uniqueRecentPeriodsByMonth(rows, 5);
    expect(unique.map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(unique.map((r) => formatPayPeriodMonthLabel(r.periodStart))).toEqual([
      "September 2026",
      "August 2026",
      "July 2026",
    ]);
  });

  it("prefers most payslips, then Finalized, then oldest createdAt when a month is duplicated", () => {
    const rows = [
      {
        id: "sep-locked-1",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        status: "LOCKED",
        createdAt: new Date("2026-09-02T12:00:00.000Z"),
        payslipCount: 1,
      },
      {
        id: "sep-draft-18",
        periodStart: new Date("2026-09-01T00:00:00.000Z"),
        status: "DRAFT",
        createdAt: new Date("2026-09-02T14:00:00.000Z"),
        payslipCount: 18,
      },
      {
        id: "aug-draft-new",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        status: "DRAFT",
        createdAt: new Date("2026-09-02T12:00:00.000Z"),
        payslipCount: 0,
      },
      {
        id: "aug-locked-old",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        status: "LOCKED",
        createdAt: new Date("2026-05-10T08:00:00.000Z"),
        payslipCount: 0,
      },
    ];
    const unique = uniqueRecentPeriodsByMonth(rows, 5);
    expect(unique.map((r) => r.id)).toEqual(["sep-draft-18", "aug-locked-old"]);
  });
});
