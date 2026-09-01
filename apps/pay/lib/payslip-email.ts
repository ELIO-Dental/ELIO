import type { Transporter } from "nodemailer";
import nodemailer from "nodemailer";
import type { PaySettings } from "./pay-settings";
import type { PayslipPdfInput } from "./payslip-pdf";
import { generatePayslipPdf } from "./payslip-pdf";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export class PayslipEmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayslipEmailConfigError";
  }
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function formatPayPeriodLabel(periodStart: Date): string {
  const month = MONTH_NAMES[periodStart.getUTCMonth()] ?? "Unknown";
  return `${month} ${periodStart.getUTCFullYear()}`;
}

export function resolveSmtpConfig(settings: PaySettings): SmtpConfig | null {
  const host = settings.smtp_host.trim();
  const user = settings.smtp_user.trim();
  const pass = settings.smtp_pass.trim();
  if (!host || !user || !pass) return null;

  const port = parseInt(settings.smtp_port || "587", 10);
  const from = settings.email_from.trim() || user;
  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user,
    pass,
    from,
  };
}

export function requireSmtpConfig(settings: PaySettings): SmtpConfig {
  const config = resolveSmtpConfig(settings);
  if (!config) {
    throw new PayslipEmailConfigError(
      "SMTP not configured. Go to Pay Settings to configure email."
    );
  }
  return config;
}

export function buildPayslipEmailHtml(opts: {
  dentistName: string;
  clinicName: string;
  periodLabel: string;
}): string {
  const clinicName = opts.clinicName.trim() || "Elio Pay";
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#0f172a;padding:20px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:24px">${escapeHtml(clinicName)}</h1>
        <p style="color:#94a3b8;margin:5px 0 0">Payslip Notification</p>
      </div>
      <div style="padding:25px;background:#fff;border:1px solid #e9ecef">
        <p>Dear ${escapeHtml(opts.dentistName)},</p>
        <p>Please find your payslip for <strong>${escapeHtml(opts.periodLabel)}</strong> attached.</p>
        <p>If you have any questions regarding your payslip, please do not hesitate to get in touch.</p>
        <p style="margin-top:20px">Kind regards,</p>
        <p style="margin:2px 0"><strong>${escapeHtml(clinicName)}</strong></p>
      </div>
      <div style="padding:15px;text-align:center;font-size:11px;color:#adb5bd">
        ${escapeHtml(clinicName)}
      </div>
    </div>
  `.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createSmtpTransporter(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
}

export interface SendPayslipEmailInput {
  payslip: PayslipPdfInput;
  settings: PaySettings;
  transporter?: Transporter;
}

export async function sendPayslipEmail({
  payslip,
  settings,
  transporter,
}: SendPayslipEmailInput): Promise<{ to: string; filename: string }> {
  const dentistEmail = payslip.dentist.email?.trim();
  if (!dentistEmail) {
    throw new PayslipEmailConfigError("Dentist has no email address");
  }

  const smtp = requireSmtpConfig(settings);
  const { buffer, filename } = await generatePayslipPdf(payslip);
  const clinicName = settings.clinic_name.trim() || "Elio Pay";
  const periodLabel = formatPayPeriodLabel(payslip.payPeriod.periodStart);
  const mailer = transporter ?? createSmtpTransporter(smtp);

  await mailer.sendMail({
    from: smtp.from,
    to: dentistEmail,
    subject: `Your Payslip - ${periodLabel}`,
    html: buildPayslipEmailHtml({
      dentistName: payslip.dentist.name,
      clinicName,
      periodLabel,
    }),
    attachments: [{ filename, content: buffer, contentType: "application/pdf" }],
  });

  return { to: dentistEmail, filename };
}

export type PayslipEmailBatchResult = {
  dentist: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
};

export async function sendAllPayslipEmails(opts: {
  payslips: PayslipPdfInput[];
  settings: PaySettings;
  transporter?: Transporter;
}): Promise<PayslipEmailBatchResult[]> {
  requireSmtpConfig(opts.settings);
  const results: PayslipEmailBatchResult[] = [];

  for (const payslip of opts.payslips) {
    if (!payslip.dentist.email?.trim()) {
      results.push({ dentist: payslip.dentist.name, status: "skipped" });
      continue;
    }
    try {
      await sendPayslipEmail({
        payslip,
        settings: opts.settings,
        transporter: opts.transporter,
      });
      results.push({ dentist: payslip.dentist.name, status: "sent" });
    } catch (err) {
      results.push({
        dentist: payslip.dentist.name,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export function summarizePayslipEmailBatch(results: PayslipEmailBatchResult[]): string {
  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  let message = `${sent} email${sent !== 1 ? "s" : ""} sent`;
  if (failed > 0) message += `, ${failed} failed`;
  if (skipped > 0) message += `, ${skipped} skipped (no email)`;
  return message;
}
