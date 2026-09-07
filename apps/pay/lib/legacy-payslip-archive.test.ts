import { describe, expect, it } from "vitest";
import {
  formatLegacyDiscrepancyType,
  formatLegacyPeriodLabel,
  legacyPayslipAnalytics,
  legacyPayslipDiscrepancies,
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
  private_patients_json: JSON.stringify([
    {
      name: "Jane Doe",
      amount: 250,
      date: "2025-01-15",
      durationMins: 40,
      hourlyRate: 375,
      status: "paid",
      finance: true,
      financeFee: 12.5,
    },
  ]),
  lab_bills_json: JSON.stringify([{ lab_name: "Acme", amount: 200, file_url: "https://example.com/bill.pdf" }]),
  adjustments_json: JSON.stringify([{ description: "Bonus", amount: 50, type: "addition" }]),
  discrepancies_json: JSON.stringify([
    {
      type: "partial_payment",
      patientName: "Jane Doe",
      invoicedAmount: 250,
      paidAmount: 100,
      date: "2025-01-15",
      notes: "Partial",
    },
  ]),
  analytics_json: JSON.stringify({
    totalChairMins: 120,
    utilizationPercent: 80,
    grossPerHour: 200,
    netPerHour: 100,
    avgAppointmentMins: 40,
    topPatientsByHourlyRate: [{ name: "Jane Doe", durationMins: 40, hourlyRate: 375 }],
  }),
});

describe("legacy payslip archive (Y2.10)", () => {
  it("parses archived row JSON", () => {
    const row = parseLegacyPayslipRow(SAMPLE_ROW);
    expect(row.gross_private).toBe(1500.5);
    expect(row.nhs_udas).toBe(88);
  });

  it("builds summary from nested legacy JSON fields", () => {
    const summary = legacyPayslipSummary(parseLegacyPayslipRow(SAMPLE_ROW), {
      splitPercent: 50,
      udaRate: 28,
    });
    expect(summary.patientCount).toBe(1);
    expect(summary.labBillTotal).toBe(200);
    expect(summary.labBillsDeduction).toBe(100);
    expect(summary.adjustmentsTotal).toBe(50);
    expect(summary.notes).toBe("Reviewed by admin");
    // gross from patients = 250; net private 125; nhs 88*28; labs 100; finance 20; therapy; super; +50 adj
    expect(summary.grossPrivate).toBe(250);
    expect(summary.netPrivate).toBe(125);
    expect(summary.nhsIncome).toBe(2464);
    expect(summary.totalDeductions).toBeGreaterThan(0);
    expect(typeof summary.netPay).toBe("number");
  });

  it("parses analytics and discrepancies", () => {
    const row = parseLegacyPayslipRow(SAMPLE_ROW);
    const analytics = legacyPayslipAnalytics(row);
    const discrepancies = legacyPayslipDiscrepancies(row);
    expect(analytics?.totalChairMins).toBe(120);
    expect(discrepancies).toHaveLength(1);
    expect(formatLegacyDiscrepancyType(discrepancies[0]?.type)).toBe("Partial payment");
  });

  it("formats period month/year label", () => {
    expect(formatLegacyPeriodLabel(3, 2025)).toBe("March 2025");
  });
});
