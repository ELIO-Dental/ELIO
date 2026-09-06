import PDFDocument from "pdfkit";
import type { Dentist, PayPeriod, PayslipEntry, PrivateRevenueLineItem, Treatment } from "@elio/db";
import { parsePayslipAdjustments, parsePayslipLabBills } from "./payslip-editable-fields";
import { financeFeesDeductionPence, therapyDeductionPence } from "./private-revenue";
import { lineCountsTowardGross } from "./payment-flags";
import { dentistHasNhs } from "./nhs-udas";
import { resolveFinanceFeesForDeduction } from "./finance-fee";
import { defaultPaySettings } from "./pay-settings";

export type PayslipPdfInput = PayslipEntry & {
  dentist: Dentist;
  payPeriod: PayPeriod;
  privateRevenueLineItems: (PrivateRevenueLineItem & { treatment: Treatment | null })[];
  /** Practice / clinic display name (Step 25 header). */
  practiceName?: string | null;
  /** Finance share bp for deduction section (defaults 5000). */
  financeFeeSplit?: number | null;
  /** Optional practice finance rate settings for resolving default fees. */
  financeRateSettings?: {
    finance_rate_3m: string;
    finance_rate_12m: string;
    finance_rate_36m: string;
    finance_rate_60m: string;
  } | null;
  /** Dentist/practice therapy £/hr override when per-minute rate unset. */
  therapyHourlyPence?: number | null;
};

function gbp(pence: number | null | undefined) {
  if (pence == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Step 25 — payment date is the 15th of the month after the pay period start month.
 * March 2026 period → 15 April 2026.
 */
export function getPayslipPaymentDate(periodStart: Date): Date {
  const y = periodStart.getUTCFullYear();
  const m = periodStart.getUTCMonth();
  return new Date(Date.UTC(y, m + 1, 15));
}

export function formatPayslipPaymentDate(periodStart: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(getPayslipPaymentDate(periodStart));
}

export type PatientBreakdownRow = {
  patientName: string;
  invoiceDate: string;
  amountPence: number;
  paidTick: boolean;
  isFinance: boolean;
};

/** Paid private lines only, ascending by invoice date (Step 25). */
export function buildPatientBreakdownRows(
  lines: Array<{
    patientName?: string | null;
    invoiceDate?: string | null;
    amountPence: number;
    paymentStatus?: string | null;
    flagged?: boolean | null;
    amountOutstandingPence?: number | null;
    excludedAsConsultation?: boolean | null;
    isFinance?: boolean | null;
    createdAt?: Date;
  }>
): PatientBreakdownRow[] {
  const paid = lines.filter(
    (li) =>
      !li.excludedAsConsultation &&
      lineCountsTowardGross({
        amountPence: li.amountPence,
        paymentStatus: li.paymentStatus,
        flagged: li.flagged,
        amountOutstandingPence: li.amountOutstandingPence,
      })
  );

  const rows = paid.map((li) => ({
    patientName: li.patientName?.trim() || "Patient",
    invoiceDate: (li.invoiceDate || "").slice(0, 10),
    amountPence: li.amountPence,
    paidTick: true,
    isFinance: Boolean(li.isFinance),
  }));

  rows.sort((a, b) => {
    const d = a.invoiceDate.localeCompare(b.invoiceDate);
    if (d !== 0) return d;
    return a.patientName.localeCompare(b.patientName);
  });
  return rows;
}

/** Generates a payslip PDF buffer + filename (PDF §7 / Step 25). */
export async function generatePayslipPdf(payslip: PayslipPdfInput): Promise<{ buffer: Buffer; filename: string }> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50,
    info: {
      Title: payslip.provisional ? "PROVISIONAL Payslip" : "Payslip",
      Author: payslip.practiceName?.trim() || "Aura Dental",
      Creator: "ElioPay",
      Producer: "ElioPay",
    },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const practice = payslip.practiceName?.trim() || "Aura Dental";
  const performer = payslip.dentist.name;
  const nhsNo = payslip.dentist.nhsPerformerNumber?.trim() || null;
  const paymentDateLabel = formatPayslipPaymentDate(payslip.payPeriod.periodStart);
  const periodLabel = `${fmtDate(payslip.payPeriod.periodStart)} – ${fmtDate(payslip.payPeriod.periodEnd)}`;

  doc.fontSize(18).fillColor("#000").font("Helvetica-Bold").text(practice, { align: "left" });
  doc.moveDown(0.25);
  doc.fontSize(14).text("Payslip", { align: "left" });
  doc.moveDown(0.4);
  doc.fontSize(10).font("Helvetica").fillColor("#333");
  doc.text(`Performer: ${performer}${nhsNo ? `  ·  NHS performer ${nhsNo}` : ""}`);
  doc.text(`Pay period: ${periodLabel}`);
  doc.text(`Payment date: ${paymentDateLabel}`);
  if (payslip.provisional) {
    doc.moveDown(0.4);
    doc.fontSize(12).fillColor("#b45309").font("Helvetica-Bold").text("PROVISIONAL — finance term/fee pending");
    doc.fillColor("#000").font("Helvetica");
    // Step 29 — body watermark (no rotate — PDFKit rotate can spill pages).
    const markY = doc.y + 220;
    doc.save();
    doc.fillColor("#b45309");
    doc.opacity(0.14);
    doc.fontSize(56).font("Helvetica-Bold");
    doc.text("PROVISIONAL", 50, markY, { width: 495, align: "center", lineBreak: false });
    doc.restore();
    doc.fillColor("#000").opacity(1).font("Helvetica");
  }
  doc.moveDown(0.8);
  doc.fillColor("#000");

  function row(label: string, value: string, bold = false) {
    doc.fontSize(11).font(bold ? "Helvetica-Bold" : "Helvetica");
    const y = doc.y;
    doc.text(label, 50, y, { width: 300, continued: false });
    doc.text(value, 350, y, { width: 195, align: "right" });
    doc.moveDown(0.35);
  }

  function section(title: string) {
    doc.moveDown(0.5);
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#000").text(title);
    doc.moveDown(0.25);
  }

  if (payslip.payType === "PERCENTAGE_SPLIT") {
    if (dentistHasNhs(payslip.dentist)) {
      section("NHS");
      row("UDAs", payslip.udas?.toString() ?? "—");
      row("UDA rate", gbp(payslip.udaRatePence));
      row("NHS income", gbp(payslip.nhsEarningsPence));
    }

    section("Private fees");
    row("Gross private", gbp(payslip.grossPrivateRevenuePence));
    row(
      "Split %",
      payslip.privateSplitPercent != null ? `${Number(payslip.privateSplitPercent)}%` : "—"
    );
    row("Net private", gbp(payslip.privateEarningsPence));
    if ((payslip.consultationExclusionsPence ?? 0) > 0) {
      row("Consultation exclusions (not paid)", gbp(payslip.consultationExclusionsPence));
    }

    section("Deductions");
    const labBills = parsePayslipLabBills(payslip.labBillsJson);
    row("Lab share", `-${gbp(payslip.labDeductionPence)}`);
    for (const bill of labBills) {
      const amountLabel = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(bill.amount);
      doc.fontSize(9).font("Helvetica").fillColor("#000").text(
        `  ${bill.lab_name || "Lab"}  —  ${amountLabel}`,
        { width: 495 }
      );
      if (bill.file_url) {
        doc.fillColor("#1a56db").text(`  ${bill.file_url}`, {
          width: 495,
          link: bill.file_url.startsWith("http") ? bill.file_url : undefined,
        });
        doc.fillColor("#000");
      }
      doc.moveDown(0.15);
    }

    const financeSplit = payslip.financeFeeSplit ?? 5000;
    const rateSettings = payslip.financeRateSettings ?? defaultPaySettings();
    const financePence = financeFeesDeductionPence(
      resolveFinanceFeesForDeduction(payslip.privateRevenueLineItems, rateSettings),
      financeSplit
    );
    if (financePence > 0) row("Finance fees", `-${gbp(financePence)}`);

    const therapyMins = payslip.therapyMinutes != null ? Number(payslip.therapyMinutes) : 0;
    const therapyRate = payslip.therapyRatePerMinute != null ? Number(payslip.therapyRatePerMinute) : 0;
    const therapyHourly =
      payslip.therapyHourlyPence ?? payslip.dentist.therapyHourlyPence ?? null;
    const therapyPence = therapyDeductionPence(therapyMins, therapyRate, therapyHourly);
    if (therapyPence > 0) {
      const rateLabel =
        therapyRate > 0
          ? ` @ £${therapyRate.toFixed(4)}/min`
          : therapyHourly != null && therapyHourly > 0
            ? ` @ £${(therapyHourly / 100).toFixed(2)}/hr`
            : " @ £35/hr default";
      row(`Therapy (${therapyMins} mins${rateLabel})`, `-${gbp(therapyPence)}`);
    }
    if ((payslip.superannuationPence ?? 0) > 0) {
      row("Superannuation", `-${gbp(payslip.superannuationPence)}`);
    }
    if ((payslip.manualAdjustmentsPence ?? 0) !== 0 || payslip.adjustmentReason) {
      row("Adjustments (net)", gbp(payslip.manualAdjustmentsPence));
      if (payslip.adjustmentReason) {
        doc.fontSize(9).fillColor("#555").text(`  ${payslip.adjustmentReason}`, { width: 495 });
        doc.fillColor("#000");
        doc.moveDown(0.2);
      }
    }
    const adjLines = parsePayslipAdjustments(payslip.adjustmentsJson);
    for (const adj of adjLines) {
      if (!(adj.amountPence > 0)) continue;
      const sign = adj.type === "deduction" ? "−" : "+";
      row(`  ${sign} ${adj.description}`, `${sign}${gbp(adj.amountPence)}`);
    }
  } else {
    section("Hourly");
    row("Hours worked", payslip.hoursWorked?.toString() ?? "—");
    row("Hourly rate", gbp(payslip.hourlyRatePence));
    row("Hourly earnings", gbp(payslip.hourlyEarningsPence));
    if ((payslip.manualAdjustmentsPence ?? 0) !== 0) {
      row("Adjustments (net)", gbp(payslip.manualAdjustmentsPence));
    }
    for (const adj of parsePayslipAdjustments(payslip.adjustmentsJson)) {
      if (!(adj.amountPence > 0)) continue;
      const sign = adj.type === "deduction" ? "−" : "+";
      row(`  ${sign} ${adj.description}`, `${sign}${gbp(adj.amountPence)}`);
    }
  }

  doc.moveDown(0.4);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
  doc.moveDown(0.35);
  row("Total payment", gbp(payslip.finalPayPence), true);

  const patients = buildPatientBreakdownRows(payslip.privateRevenueLineItems);
  if (patients.length > 0) {
    section("Patient breakdown");
    doc.fontSize(9).font("Helvetica-Bold");
    const y0 = doc.y;
    doc.text("Patient", 50, y0, { width: 180 });
    doc.text("Date", 230, y0, { width: 80 });
    doc.text("Paid", 320, y0, { width: 40 });
    doc.text("Amount", 370, y0, { width: 120, align: "right" });
    doc.moveDown(0.35);
    doc.font("Helvetica");
    for (const p of patients) {
      const y = doc.y;
      const name = p.isFinance ? `${p.patientName} [FIN]` : p.patientName;
      doc.text(name, 50, y, { width: 180 });
      doc.text(p.invoiceDate || "—", 230, y, { width: 80 });
      doc.text(p.paidTick ? "✓" : "○", 320, y, { width: 40 });
      doc.text(gbp(p.amountPence), 370, y, { width: 120, align: "right" });
      doc.moveDown(0.3);
      if (doc.y > 750) {
        doc.addPage();
      }
    }
  }

  // PDF §7 / Step 25 — no "generated on" timestamp on payslips.
  doc.end();
  const raw = await done;
  const buffer = stripPdfTimestamps(raw);
  const filename = `payslip-${payslip.dentist.name.replace(/\s+/g, "-")}-${fmtDate(payslip.payPeriod.periodStart)}.pdf`;
  return { buffer, filename };
}

/** Remove PDFKit CreationDate / ModDate so viewers show no generated timestamp. */
export function stripPdfTimestamps(buffer: Buffer): Buffer {
  let s = buffer.toString("latin1");
  // PDFKit often stores dates as indirect objects: /CreationDate 15 0 R
  s = s.replace(/\/CreationDate\s+\d+\s+0\s+R/g, "");
  s = s.replace(/\/ModDate\s+\d+\s+0\s+R/g, "");
  s = s.replace(/\/CreationDate\s*\([^)]*\)/g, "");
  s = s.replace(/\/ModDate\s*\([^)]*\)/g, "");
  s = s.replace(/<xmp:CreateDate>[^<]*<\/xmp:CreateDate>/gi, "");
  s = s.replace(/<xmp:ModifyDate>[^<]*<\/xmp:ModifyDate>/gi, "");
  return Buffer.from(s, "latin1");
}
