import { describe, expect, it } from "vitest";
import { generatePayslipPdf, type PayslipPdfInput } from "./payslip-pdf";

const basePayslip = {
  id: "ps-1",
  practiceId: "prac-1",
  payPeriodId: "pp-1",
  dentistId: "d-1",
  payType: "PERCENTAGE_SPLIT" as const,
  udas: 100,
  udaRatePence: 2810,
  nhsEarningsPence: 281000,
  grossPrivateRevenuePence: 500000,
  privateSplitPercent: 50,
  privateEarningsPence: 250000,
  consultationExclusionsPence: 0,
  labDeductionPence: 10000,
  superannuationPence: 5000,
  hoursWorked: null,
  hourlyRatePence: null,
  hourlyEarningsPence: null,
  manualAdjustmentsPence: 0,
  adjustmentReason: null,
  finalPayPence: 516000,
  pdfUrl: null,
  dentallyPatientsJson: null,
  dentallyAnalyticsJson: null,
  dentallyTherapyJson: null,
  dentallyDiscrepanciesJson: null,
  therapyMinutes: null,
  therapyRatePerMinute: null,
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-06-01"),
  dentist: { id: "d-1", name: "Dr Test", practiceId: "prac-1" } as never,
  payPeriod: {
    id: "pp-1",
    practiceId: "prac-1",
    periodStart: new Date("2026-05-01"),
    periodEnd: new Date("2026-05-31"),
    status: "DRAFT" as const,
    lockedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  privateRevenueLineItems: [],
} as unknown as PayslipPdfInput;

describe("generatePayslipPdf (Y2.1)", () => {
  it("returns a PDF buffer and dentist filename", async () => {
    const { buffer, filename } = await generatePayslipPdf(basePayslip);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
    expect(filename).toContain("Dr-Test");
    expect(filename.endsWith(".pdf")).toBe(true);
  });
});
