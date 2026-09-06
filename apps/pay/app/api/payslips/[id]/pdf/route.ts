import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { loadPayslipPdfInput } from "@/lib/payslip-load";
import { generatePayslipPdf } from "@/lib/payslip-pdf";
import { loadStoredPayslipPdf } from "@/lib/payslip-version";
import { resolvePayPractitionerScope } from "@/lib/pay-scope";

/**
 * Step 26/30 — PDF export bound to payslip version when locked.
 * Clinicians with own-only scope cannot download another dentist's PDF (IDOR → 403).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAnyPermission(
      "pay:download-payslip",
      "pay:download-payslip:readonly",
      "pay:download-payslip:own"
    );
    const { id } = await params;
    const url = new URL(req.url);
    const versionRaw = url.searchParams.get("version");
    const version =
      versionRaw != null && versionRaw !== "" ? Number(versionRaw) : null;

    const scope = await resolvePayPractitionerScope(session.practiceId, session);

    if (version != null && Number.isFinite(version)) {
      await loadPayslipPdfInput(session.practiceId, id, { scope });
      const stored = await loadStoredPayslipPdf(session.practiceId, id, version);
      if (!stored) return NextResponse.json({ error: "Version not found" }, { status: 404 });
      return pdfResponse(stored.buffer, stored.filename);
    }

    const payslip = await loadPayslipPdfInput(session.practiceId, id, { scope });
    if (!payslip) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (payslip.payPeriod.status === "LOCKED") {
      const stored = await loadStoredPayslipPdf(session.practiceId, id);
      if (stored) return pdfResponse(stored.buffer, stored.filename);
    }

    const { buffer, filename } = await generatePayslipPdf(payslip);
    return pdfResponse(buffer, filename);
  } catch (err) {
    return errorResponse(err);
  }
}

function pdfResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
