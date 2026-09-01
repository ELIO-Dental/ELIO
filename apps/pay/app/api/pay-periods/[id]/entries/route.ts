import { NextResponse } from "next/server";
import { savePayslipEntry, type SavePayslipEntryInput } from "@/lib/pay-service";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Save a single dentist payslip without recalculating the whole period (Y2.1a). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as SavePayslipEntryInput;

    if (!body?.payslipEntryId) {
      return NextResponse.json({ error: "payslipEntryId required" }, { status: 400 });
    }

    const payslip = await savePayslipEntry(session.practiceId, payPeriodId, body);
    return NextResponse.json({ ok: true, payslip });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    if (message === "Pay period is locked") return NextResponse.json({ error: message }, { status: 409 });
    if (message === "Payslip not found" || message === "Pay period not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
