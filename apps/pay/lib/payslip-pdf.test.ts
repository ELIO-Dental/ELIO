import pdfParse from "pdf-parse";
import { describe, expect, it } from "vitest";
import {
  buildPatientBreakdownRows,
  formatPayslipPaymentDate,
  generatePayslipPdf,
  getPayslipPaymentDate,
  type PayslipPdfInput,
} from "./payslip-pdf";

/** PDFKit subsets/hex-encodes glyphs in its content streams — extract real
 * rendered text via pdf-parse rather than string-matching the raw buffer. */
async function extractPdfText(buffer: Buffer): Promise<string> {
  return (await pdfParse(buffer)).text;
}

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
  labBillsJson: [
    { lab_name: "Acme Lab", amount: 100, file_url: "https://example.com/acme.pdf" },
    { lab_name: "Beta Lab", amount: 50 },
  ],
  therapyMinutes: null,
  therapyRatePerMinute: null,
  provisional: false,
  createdAt: new Date("2026-06-01"),
  updatedAt: new Date("2026-06-01"),
  practiceName: "Aura Dental Clinic",
  financeFeeSplit: 5000,
  dentist: {
    id: "d-1",
    name: "Dr Test",
    practiceId: "prac-1",
    nhsPerformerNumber: "123456",
  } as never,
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
  privateRevenueLineItems: [
    {
      patientName: "Late Patient",
      invoiceDate: "2026-03-20",
      amountPence: 10000,
      paymentStatus: "paid",
      flagged: false,
      amountOutstandingPence: 0,
      isFinance: false,
      excludedAsConsultation: false,
      treatment: null,
    },
    {
      patientName: "Early Patient",
      invoiceDate: "2026-03-05",
      amountPence: 20000,
      paymentStatus: "paid",
      flagged: false,
      amountOutstandingPence: 0,
      isFinance: false,
      excludedAsConsultation: false,
      treatment: null,
    },
    {
      patientName: "Unpaid Patient",
      invoiceDate: "2026-03-10",
      amountPence: 5000,
      paymentStatus: "unpaid",
      flagged: true,
      amountOutstandingPence: 5000,
      isFinance: false,
      excludedAsConsultation: false,
      treatment: null,
    },
  ],
} as unknown as PayslipPdfInput;

describe("Step 25 payment date", () => {
  it("March period → 15 April", () => {
    const start = new Date("2026-03-01T00:00:00.000Z");
    expect(getPayslipPaymentDate(start).toISOString().slice(0, 10)).toBe("2026-04-15");
    expect(formatPayslipPaymentDate(start)).toBe("15 April 2026");
  });
});

describe("buildPatientBreakdownRows (Step 25)", () => {
  it("excludes unpaid and sorts by date ascending", () => {
    const rows = buildPatientBreakdownRows(basePayslip.privateRevenueLineItems);
    expect(rows.map((r) => r.patientName)).toEqual(["Early Patient", "Late Patient"]);
    expect(rows.every((r) => r.paidTick)).toBe(true);
  });
});

describe("generatePayslipPdf (Step 25/29)", () => {
  it("returns a PDF with header, payment date, lab link, no generated-on / CreationDate", async () => {
    const { buffer, filename } = await generatePayslipPdf(basePayslip);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
    expect(filename).toContain("Dr-Test");
    expect(filename.endsWith(".pdf")).toBe(true);
    const text = buffer.toString("latin1");
    expect(text).toContain("https://example.com/acme.pdf");
    expect(text).not.toMatch(/generated on/i);
    expect(text).not.toMatch(/Generated 20\d{2}/);
    // PDFKit CreationDate metadata must be suppressed (Step 25).
    expect(text).not.toMatch(/CreationDate/i);
    expect(text).not.toMatch(/CreateDate/i);
  });

  it("embeds PROVISIONAL watermark when provisional", async () => {
    const { buffer } = await generatePayslipPdf({ ...basePayslip, provisional: true });
    const text = buffer.toString("latin1");
    // Title is stored uncompressed in the PDF info dict.
    expect(text).toMatch(/PROVISIONAL Payslip/);
  });

  it("shows a highest-ticket callout, treatment name, and finance fee for patients over £500", async () => {
    const payslip = {
      ...basePayslip,
      clinicWebsite: "https://aura-dental.example.com",
      privateRevenueLineItems: [
        ...basePayslip.privateRevenueLineItems,
        {
          patientName: "Big Spender",
          invoiceDate: "2026-03-15",
          amountPence: 60000,
          paymentStatus: "paid",
          flagged: false,
          amountOutstandingPence: 0,
          isFinance: true,
          financeFeePence: 1234,
          excludedAsConsultation: false,
          treatment: { dentallyTreatmentCategory: "Full Mouth Reconstruction" },
        },
      ],
    } as unknown as PayslipPdfInput;

    const { buffer } = await generatePayslipPdf(payslip);
    const text = await extractPdfText(buffer);
    expect(text).toContain("HIGHEST TICKET");
    expect(text).toContain("Big Spender");
    expect(text).toContain("Full Mouth Reconstruction");
    // Finance fee is shown per-line instead of a generic [FIN] tag.
    expect(text).not.toContain("[FIN]");
    expect(text).toContain("12.34");
    // Footer: clinic website + page count on every page.
    expect(text).toContain("aura-dental.example.com");
    expect(text).toMatch(/1 \/ 1/);
  });
});
