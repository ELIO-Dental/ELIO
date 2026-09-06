import { describe, expect, it } from "vitest";
import {
  formatPayPeriodMonthLabel,
  formatPayPeriodMonthShort,
  formatPayPeriodStatusLabel,
} from "./pay-dashboard-labels";

describe("pay-dashboard-labels (Step 37 / AuraPay home)", () => {
  it("formats month labels like legacy AuraPay", () => {
    const may = new Date("2026-05-01T00:00:00.000Z");
    const sep = new Date("2026-09-01T00:00:00.000Z");
    expect(formatPayPeriodMonthLabel(may)).toBe("May 2026");
    expect(formatPayPeriodMonthShort(may)).toBe("May");
    expect(formatPayPeriodMonthLabel(sep)).toBe("September 2026");
    expect(formatPayPeriodMonthShort(sep)).toBe("Sep");
  });

  it("maps LOCKED → Finalized and DRAFT → Draft", () => {
    expect(formatPayPeriodStatusLabel("LOCKED")).toBe("Finalized");
    expect(formatPayPeriodStatusLabel("DRAFT")).toBe("Draft");
  });
});
