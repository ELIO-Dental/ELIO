import { describe, expect, it, vi } from "vitest";
import type { Transporter } from "nodemailer";
import {
  buildPayslipEmailHtml,
  formatPayPeriodLabel,
  requireSmtpConfig,
  resolveSmtpConfig,
  sendAllPayslipEmails,
  sendPayslipEmail,
  summarizePayslipEmailBatch,
  PayslipEmailConfigError,
} from "./payslip-email";
import type { PaySettings } from "./pay-settings";
import type { PayslipPdfInput } from "./payslip-pdf";

const smtpSettings: PaySettings = {
  clinic_name: "Aura Dental",
  clinic_logo_url: "",
  clinic_address_line1: "",
  clinic_address_line2: "",
  clinic_city: "",
  clinic_postcode: "",
  clinic_phone: "",
  clinic_email: "",
  clinic_website: "",
  therapy_hourly_rate: "35",
  therapy_rate: "0.5833",
  lab_bill_split: "0.50",
  finance_fee_split: "0.50",
  finance_rate_3m: "0.045",
  finance_rate_12m: "0.08",
  finance_rate_36m: "0.034",
  finance_rate_60m: "0.037",
  dentally_site_id: "",
  therapist_ids: "",
  nhs_amounts: "",
  cosmetic_consultation_treatment_code: "",
  smtp_host: "smtp.example.com",
  smtp_port: "587",
  smtp_user: "user@example.com",
  smtp_pass: "secret",
  email_from: "pay@example.com",
};

function makePayslip(overrides?: Partial<PayslipPdfInput>): PayslipPdfInput {
  return {
    id: "ps-1",
    practiceId: "prac-1",
    payPeriodId: "pp-1",
    dentistId: "d-1",
    payType: "PERCENTAGE_SPLIT",
    udas: 100 as never,
    udaRatePence: 2810,
    nhsEarningsPence: 281000,
    grossPrivateRevenuePence: 500000,
    privateSplitPercent: 50 as never,
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
    dentallyDentistLogJson: null,
    therapyMinutes: null,
    therapyRatePerMinute: null,
    createdAt: new Date("2026-06-01"),
    updatedAt: new Date("2026-06-01"),
    dentist: {
      id: "d-1",
      name: "Dr Test",
      email: "dentist@example.com",
      practiceId: "prac-1",
    } as never,
    payPeriod: {
      id: "pp-1",
      practiceId: "prac-1",
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-31"),
      status: "DRAFT",
      nhsPeriodStart: null,
      nhsPeriodEnd: null,
      createdAt: new Date("2026-06-01"),
      updatedAt: new Date("2026-06-01"),
    } as never,
    privateRevenueLineItems: [],
    ...overrides,
  } as PayslipPdfInput;
}

describe("resolveSmtpConfig", () => {
  it("returns null when SMTP is incomplete", () => {
    expect(resolveSmtpConfig({ ...smtpSettings, smtp_host: "" })).toBeNull();
    expect(resolveSmtpConfig({ ...smtpSettings, smtp_pass: "" })).toBeNull();
  });

  it("returns config with defaults and from address", () => {
    expect(resolveSmtpConfig(smtpSettings)).toEqual({
      host: "smtp.example.com",
      port: 587,
      user: "user@example.com",
      pass: "secret",
      from: "pay@example.com",
    });
  });

  it("falls back from address to SMTP user", () => {
    expect(resolveSmtpConfig({ ...smtpSettings, email_from: "" })?.from).toBe("user@example.com");
  });
});

describe("requireSmtpConfig", () => {
  it("throws when SMTP is missing", () => {
    expect(() => requireSmtpConfig({ ...smtpSettings, smtp_user: "" })).toThrow(PayslipEmailConfigError);
  });
});

describe("formatPayPeriodLabel", () => {
  it("formats month and year in UK locale", () => {
    expect(formatPayPeriodLabel(new Date("2026-05-15T12:00:00Z"))).toMatch(/May 2026/);
  });
});

describe("buildPayslipEmailHtml", () => {
  it("includes clinic and dentist names", () => {
    const html = buildPayslipEmailHtml({
      dentistName: "Dr Test",
      clinicName: "Aura Dental",
      periodLabel: "May 2026",
    });
    expect(html).toContain("Aura Dental");
    expect(html).toContain("Dear Dr Test");
    expect(html).toContain("May 2026");
  });
});

describe("sendPayslipEmail", () => {
  it("sends mail with PDF attachment via injected transporter", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
    const transporter = { sendMail } as unknown as Transporter;

    const result = await sendPayslipEmail({
      payslip: makePayslip(),
      settings: smtpSettings,
      transporter,
    });

    expect(result.to).toBe("dentist@example.com");
    expect(sendMail).toHaveBeenCalledOnce();
    const mail = sendMail.mock.calls[0]?.[0];
    expect(mail?.to).toBe("dentist@example.com");
    expect(mail?.from).toBe("pay@example.com");
    expect(mail?.subject).toContain("May 2026");
    expect(mail?.attachments?.[0]?.contentType).toBe("application/pdf");
  });

  it("rejects dentists without email", async () => {
    await expect(
      sendPayslipEmail({
        payslip: makePayslip({ dentist: { ...makePayslip().dentist, email: null } as never }),
        settings: smtpSettings,
        transporter: { sendMail: vi.fn() } as unknown as Transporter,
      })
    ).rejects.toThrow("Dentist has no email address");
  });
});

describe("sendAllPayslipEmails", () => {
  it("sends to entries with email and skips others", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "1" });
    const transporter = { sendMail } as unknown as Transporter;

    const results = await sendAllPayslipEmails({
      settings: smtpSettings,
      transporter,
      payslips: [
        makePayslip(),
        makePayslip({
          id: "ps-2",
          dentist: { ...makePayslip().dentist, name: "No Email", email: null } as never,
        }),
      ],
    });

    expect(results).toEqual([
      { dentist: "Dr Test", status: "sent" },
      { dentist: "No Email", status: "skipped" },
    ]);
    expect(sendMail).toHaveBeenCalledOnce();
  });
});

describe("summarizePayslipEmailBatch", () => {
  it("summarizes sent, failed, and skipped counts", () => {
    expect(
      summarizePayslipEmailBatch(
        [
          { dentist: "A", status: "sent" },
          { dentist: "B", status: "failed", error: "x" },
          { dentist: "C", status: "skipped" },
        ]
      )
    ).toBe("1 email sent, 1 failed, 1 skipped (no email)");
  });
});
