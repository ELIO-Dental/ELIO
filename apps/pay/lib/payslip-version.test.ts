import { describe, expect, it } from "vitest";
import {
  buildPayslipVersionSnapshot,
  hashPdfBuffer,
  nextPayslipVersionNumber,
  versionedPdfHref,
} from "./payslip-version";
import { generatePayslipPdf, type PayslipPdfInput } from "./payslip-pdf";

describe("payslip version helpers (Step 26)", () => {
  it("increments version numbers", () => {
    expect(nextPayslipVersionNumber(null)).toBe(1);
    expect(nextPayslipVersionNumber(undefined)).toBe(1);
    expect(nextPayslipVersionNumber(1)).toBe(2);
    expect(nextPayslipVersionNumber(7)).toBe(8);
  });

  it("builds versioned PDF href", () => {
    expect(versionedPdfHref("ps-1", 2)).toBe("/pay/api/payslips/ps-1/pdf?version=2");
  });

  it("hashes PDF buffer stably and snapshot stores final pay pence", async () => {
    const payslip = {
      id: "ps-1",
      practiceId: "prac-1",
      payPeriodId: "pp-1",
      dentistId: "d-1",
      payType: "PERCENTAGE_SPLIT" as const,
      udas: null,
      udaRatePence: null,
      nhsEarningsPence: 0,
      grossPrivateRevenuePence: 100000,
      privateSplitPercent: 50,
      privateEarningsPence: 50000,
      consultationExclusionsPence: 0,
      labDeductionPence: 10000,
      superannuationPence: 0,
      hoursWorked: null,
      hourlyRatePence: null,
      hourlyEarningsPence: null,
      manualAdjustmentsPence: 0,
      adjustmentReason: null,
      finalPayPence: 40000,
      pdfUrl: null,
      dentallyPatientsJson: null,
      dentallyAnalyticsJson: null,
      dentallyTherapyJson: null,
      dentallyDiscrepanciesJson: null,
      labBillsJson: [{ lab_name: "Acme", amount: 100, file_url: "https://example.com/lab.pdf" }],
      therapyMinutes: null,
      therapyRatePerMinute: null,
      provisional: false,
      createdAt: new Date("2026-06-01"),
      updatedAt: new Date("2026-06-01"),
      practiceName: "Aura Dental",
      financeFeeSplit: 5000,
      dentist: { id: "d-1", name: "Dr Test", practiceId: "prac-1", nhsPerformerNumber: null } as never,
      payPeriod: {
        id: "pp-1",
        practiceId: "prac-1",
        periodStart: new Date("2026-03-01T00:00:00.000Z"),
        periodEnd: new Date("2026-04-01T00:00:00.000Z"),
        status: "DRAFT" as const,
        lockedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      privateRevenueLineItems: [],
    } as unknown as PayslipPdfInput;

    const { buffer, filename } = await generatePayslipPdf(payslip);
    const sha1 = hashPdfBuffer(buffer);
    // Stored snapshot is byte-immutable (base64 round-trip).
    expect(hashPdfBuffer(Buffer.from(buffer.toString("base64"), "base64"))).toBe(sha1);
    expect(sha1).toHaveLength(64);

    const snap = buildPayslipVersionSnapshot(payslip, filename);
    expect(snap.finalPayPence).toBe(40000);
    expect(snap.labDeductionPence).toBe(10000);
    expect(snap.filename).toBe(filename);

    // Live regenerate may differ (PDFKit IDs); Step 26 immutability is the *stored* version.
    const again = await generatePayslipPdf(payslip);
    expect(again.buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(hashPdfBuffer(again.buffer)).toHaveLength(64);
  });
});
