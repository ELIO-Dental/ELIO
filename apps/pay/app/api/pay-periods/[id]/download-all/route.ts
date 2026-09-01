import { NextResponse } from "next/server";
import JSZip from "jszip";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { generatePayslipPdf } from "@/lib/payslip-pdf";

/** ZIP of all payslip PDFs for a period (legacy download-all, Y2.1). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:download-payslip");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: {
          include: {
            dentist: true,
            payPeriod: true,
            privateRevenueLineItems: { include: { treatment: true } },
          },
        },
      },
    });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (payPeriod.payslipEntries.length === 0) {
      return NextResponse.json({ error: "No payslips for this period" }, { status: 400 });
    }

    const zip = new JSZip();
    for (const entry of payPeriod.payslipEntries) {
      const { buffer, filename } = await generatePayslipPdf(entry);
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
