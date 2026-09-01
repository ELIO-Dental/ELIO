import { NextResponse } from "next/server";
import { listPayslipEntriesForPeriod, savePayslipEntry } from "@/lib/pay-service";
import { normalizeSavePayslipEntryInput } from "@/lib/save-payslip-entry";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** List payslip entries for a period (legacy GET /periods/entries?period_id=, Y2.1a). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:view");
    const { id: payPeriodId } = await params;
    const entries = await listPayslipEntriesForPeriod(session.practiceId, payPeriodId);
    return NextResponse.json({ entries });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Save a single dentist payslip without recalculating the whole period (Y2.1a). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const input = normalizeSavePayslipEntryInput(body);

    if (!input.payslipEntryId) {
      return NextResponse.json({ error: "payslipEntryId required" }, { status: 400 });
    }

    const payslip = await savePayslipEntry(session.practiceId, payPeriodId, input);
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
