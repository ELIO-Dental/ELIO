import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { generatePayslipPdf } from "@/lib/payslip-pdf";

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

    const { buffer, filename } = await generatePayslipPdf(payslip);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
