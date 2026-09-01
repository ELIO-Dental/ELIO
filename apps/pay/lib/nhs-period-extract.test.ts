import { describe, expect, it } from "vitest";
import { convertToISODate, extractNhsPeriodDates, toValidISODate } from "./nhs-period-extract";

describe("nhs period extract (Y2.8)", () => {
  it("converts UK slash dates", () => {
    expect(convertToISODate("18/12/2025")).toBe("2025-12-18");
    expect(convertToISODate("01/01/26")).toBe("2026-01-01");
  });

  it("validates ISO dates", () => {
    expect(toValidISODate("2026-01-31")).toBe("2026-01-31");
    expect(toValidISODate("2026-02-30")).toBeNull();
    expect(toValidISODate("bad")).toBeNull();
  });

  it("extracts DD/MM/YYYY ranges from statement text", () => {
    const result = extractNhsPeriodDates("Activity for January (18/12/2025 - 20/01/2026)");
    expect(result.periodStart).toBe("2025-12-18");
    expect(result.periodEnd).toBe("2026-01-20");
  });

  it("extracts written month ranges", () => {
    const result = extractNhsPeriodDates("Schedule Period 1st January 2026 - 31st January 2026");
    expect(result.periodStart).toBe("2026-01-01");
    expect(result.periodEnd).toBe("2026-01-31");
  });
});
