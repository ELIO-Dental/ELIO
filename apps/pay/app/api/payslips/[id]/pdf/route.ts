import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

function gbp(pence: number | null | undefined) {
  if (pence == null) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Generates a PDF payslip for a locked (or unlocked, for preview) PayslipEntry,
 * showing EVERY source figure per DATA_MODEL.md §3's PayslipEntry — not just the
 * total. Read access gated by `pay:download-payslip` (incl. readonly for AUDITOR).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:download-payslip");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const payslip = await db.payslipEntry.findUnique({
      where: { id },
      include: {
        dentist: true,
        payPeriod: true,
        privateRevenueLineItems: { include: { treatment: true } },
      },
    });
    if (!payslip) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc.fontSize(18).text("Elio Pay — Payslip", { align: "left" });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#555").text(
      `Pay period: ${fmtDate(payslip.payPeriod.periodStart)} – ${fmtDate(payslip.payPeriod.periodEnd)}  |  Status: ${payslip.payPeriod.status}`,
    );
    doc.text(`Dentist: ${payslip.dentist.name}  |  Pay type: ${payslip.payType}`);
    doc.moveDown(1);
    doc.fillColor("#000");

    function row(label: string, value: string, bold = false) {
      doc.fontSize(11).font(bold ? "Helvetica-Bold" : "Helvetica");
      const y = doc.y;
      doc.text(label, 50, y, { width: 300, continued: false });
      doc.text(value, 350, y, { width: 195, align: "right" });
      doc.moveDown(0.4);
    }

    doc.fontSize(13).font("Helvetica-Bold").text("Source figures");
    doc.moveDown(0.3);

    if (payslip.payType === "PERCENTAGE_SPLIT") {
      row("UDAs", payslip.udas?.toString() ?? "—");
      row("UDA rate", gbp(payslip.udaRatePence));
      row("NHS earnings", gbp(payslip.nhsEarningsPence));
      row("Gross private revenue", gbp(payslip.grossPrivateRevenuePence));
      row("Private split %", payslip.privateSplitPercent ? `${payslip.privateSplitPercent.toString()}%` : "—");
      row("Private earnings", gbp(payslip.privateEarningsPence));
      row("Consultation exclusions (excluded, not paid)", gbp(payslip.consultationExclusionsPence));
      row("Lab deduction", `-${gbp(payslip.labDeductionPence)}`);
      row("Superannuation", `-${gbp(payslip.superannuationPence)}`);
      const therapyMins = payslip.therapyMinutes != null ? Number(payslip.therapyMinutes) : 0;
      const therapyRate = payslip.therapyRatePerMinute != null ? Number(payslip.therapyRatePerMinute) : 0;
      if (therapyMins > 0 && therapyRate > 0) {
        const therapyPence = Math.round(therapyMins * therapyRate * 100);
        row(
          `Therapy (${therapyMins} mins @ £${therapyRate.toFixed(4)}/min)`,
          `-${gbp(therapyPence)}`
        );
      }
    } else {
      row("Hours worked", payslip.hoursWorked?.toString() ?? "—");
      row("Hourly rate", gbp(payslip.hourlyRatePence));
      row("Hourly earnings", gbp(payslip.hourlyEarningsPence));
    }
    row("Manual adjustments", gbp(payslip.manualAdjustmentsPence));
    if (payslip.adjustmentReason) {
      doc.fontSize(9).fillColor("#555").text(`Adjustment reason: ${payslip.adjustmentReason}`, { width: 495 });
      doc.fillColor("#000");
      doc.moveDown(0.3);
    }
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.3);
    row("Final pay", gbp(payslip.finalPayPence), true);

    if (payslip.privateRevenueLineItems.length > 0) {
      doc.moveDown(1);
      doc.fontSize(13).font("Helvetica-Bold").text("Private revenue line items");
      doc.moveDown(0.3);
      for (const li of payslip.privateRevenueLineItems) {
        const label = li.treatment
          ? `Treatment ${li.treatment.dentallyId} (${fmtDate(li.treatment.completedAt ?? li.createdAt)})`
          : "Manual line item";
        doc.fontSize(9).font("Helvetica").text(
          `${label}  —  ${gbp(li.amountPence)}${li.excludedAsConsultation ? "  (EXCLUDED — cosmetic consultation)" : ""}`,
          { width: 495 },
        );
      }
    }

    doc.moveDown(1.5);
    doc.fontSize(8).fillColor("#888").text(
      `Generated ${new Date().toISOString()}. Locked payslip figures are snapshots and do not change if rates/splits are edited afterward.`,
      { width: 495 },
    );

    doc.end();
    const buffer = await done;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${payslip.dentist.name.replace(/\s+/g, "-")}-${fmtDate(payslip.payPeriod.periodStart)}.pdf"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
