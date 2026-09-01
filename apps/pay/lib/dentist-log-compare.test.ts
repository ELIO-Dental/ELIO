import { describe, expect, it } from "vitest";
import {
  compareDentistLogWithSystem,
  formatLogDate,
  parseDentistLogCsv,
  calculateLogMatchScore,
} from "./dentist-log-compare";

describe("dentist log compare (Y2.7)", () => {
  it("parses CSV log rows", () => {
    const entries = parseDentistLogCsv(
      "Patient,Date,Amount\nJohn Smith,15/01/2025,250.00,Crown\nJane Doe,2025-01-16,95,Filling"
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]?.patientName).toBe("John Smith");
    expect(entries[0]?.amount).toBe(250);
  });

  it("parses tab-separated log rows", () => {
    const entries = parseDentistLogCsv("Patient\tDate\tAmount\nJohn Smith\t15/01/2025\t250.00\tCrown");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.patientName).toBe("John Smith");
    expect(entries[0]?.amount).toBe(250);
  });

  it("formats UK-style dates", () => {
    expect(formatLogDate("15/01/2025")).toBe("2025-01-15");
  });

  it("scores exact name/date/amount matches highly", () => {
    const score = calculateLogMatchScore(
      { patientName: "Jane Smith", date: "2025-05-01", amount: 100 },
      { name: "Jane Smith", date: "2025-05-01", amount: 100 }
    );
    expect(score).toBeGreaterThanOrEqual(90);
  });

  it("finds log-only and system-only discrepancies", () => {
    const { logDiscrepancies } = compareDentistLogWithSystem(
      [{ patientName: "Alice Cooper", date: "2025-05-01", amount: 80 }],
      [{ name: "Bob Builder", date: "2025-05-02", amount: 120 }]
    );
    expect(logDiscrepancies.some((d) => d.type === "in_log_not_system")).toBe(true);
    expect(logDiscrepancies.some((d) => d.type === "in_system_not_log")).toBe(true);
  });
});
