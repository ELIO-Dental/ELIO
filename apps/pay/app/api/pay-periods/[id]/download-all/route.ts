import { NextResponse } from "next/server";
import JSZip from "jszip";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { generatePayslipPdf } from "@/lib/payslip-pdf";
import { getPaySettings } from "@/lib/pay-settings-service";
import { enrichPayslipPdfInput } from "@/lib/payslip-pdf-enrich";
import { resolvePeriodRatesByDentistId } from "@/lib/period-dentist-rates";
import { loadStoredPayslipPdf } from "@/lib/payslip-version";

/** ZIP of all payslip PDFs for a period (ops-only via pay:download-payslip — Step 30). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:download-payslip");
    const { id } = await params;
    const db = scopedDb(session.practiceId);
    const paySettings = await getPaySettings(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: {
          include: {
            dentist: true,
            payPeriod: true,
            privateRevenueLineItems: {
              include: { treatment: true },
              orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (payPeriod.payslipEntries.length === 0) {
      return NextResponse.json({ error: "No payslips for this period" }, { status: 400 });
    }

    const dentistIds = [...new Set(payPeriod.payslipEntries.map((e) => e.dentistId))];
    const rateHistory = await db.dentistRateHistory.findMany({
      where: { dentistId: { in: dentistIds } },
      orderBy: { effectiveFrom: "desc" },
    });
    const ratesByDentist = resolvePeriodRatesByDentistId(
      payPeriod.payslipEntries.map((e) => e.dentist),
      rateHistory,
      payPeriod.periodEnd
    );

    const zip = new JSZip();
    for (const entry of payPeriod.payslipEntries) {
      if (payPeriod.status === "LOCKED") {
        const stored = await loadStoredPayslipPdf(session.practiceId, entry.id);
        if (stored) {
          zip.file(stored.filename, stored.buffer);
          continue;
        }
      }
      const { buffer, filename } = await generatePayslipPdf(
        enrichPayslipPdfInput(entry, paySettings, ratesByDentist.get(entry.dentistId))
      );
      zip.file(filename, buffer);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const zipFilename = `payslips-${payPeriod.periodStart.toISOString().slice(0, 10)}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
