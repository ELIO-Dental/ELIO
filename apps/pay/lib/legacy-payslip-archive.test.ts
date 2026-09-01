import { describe, expect, it } from "vitest";
import {
  formatLegacyPeriodLabel,
  legacyPayslipSummary,
  parseLegacyPayslipRow,
} from "./legacy-payslip-archive";

const SAMPLE_ROW = JSON.stringify({
  id: 42,
  gross_private: 1500.5,
  nhs_udas: 88,
  finance_fees: 40,
  therapy_minutes: 30,
  therapy_rate: 0.5833,
  superannuation_deduction: 120.25,
  notes: "Reviewed by admin",
  private_patients_json: JSON.stringify([{ name: "Jane Doe", amount: 250, date: "2025-01-15" }]),
  lab_bills_json: JSON.stringify([{ lab_name: "Acme", amount: 200 }]),
  adjustments_json: JSON.stringify([{ description: "Bonus", amount: 50, type: "addition" }]),
});

describe("legacy payslip archive (Y2.10)", () => {
  it("parses archived row JSON", () => {
    const row = parseLegacyPayslipRow(SAMPLE_ROW);
    expect(row.gross_private).toBe(1500.5);
    expect(row.nhs_udas).toBe(88);
  });

  it("builds summary from nested legacy JSON fields", () => {
    const summary = legacyPayslipSummary(parseLegacyPayslipRow(SAMPLE_ROW));
    expect(summary.patientCount).toBe(1);
    expect(summary.labBillTotal).toBe(200);
    expect(summary.adjustmentsTotal).toBe(50);
    expect(summary.notes).toBe("Reviewed by admin");
  });

  it("formats period month/year label", () => {
    expect(formatLegacyPeriodLabel(3, 2025)).toBe("March 2025");
  });
});
