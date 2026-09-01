import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { importDentistLogForPayslip } from "@/lib/import-dentist-log";
import { parseDentistLogJson } from "@/lib/dentist-log-compare";
import { parsePayDiscrepancies } from "@/lib/pay-discrepancies";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  if (message === "Pay period is locked") return NextResponse.json({ error: message }, { status: 409 });
  if (message === "Payslip not found") return NextResponse.json({ error: message }, { status: 404 });
  if (message === "No valid log entries found") return NextResponse.json({ error: message }, { status: 400 });
  return errorResponse(err);
}

/** Import dentist private log and compare with Dentally patients (legacy Y2.7). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:manual-adjustment");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const payslipEntryId = String(body.payslipEntryId ?? body.entry_id ?? "");
    if (!payslipEntryId) {
      return NextResponse.json({ error: "payslipEntryId required" }, { status: 400 });
    }

    const result = await importDentistLogForPayslip(session.practiceId, payPeriodId, payslipEntryId, {
      csvData: typeof body.csv_data === "string" ? body.csv_data : typeof body.csvData === "string" ? body.csvData : undefined,
      logEntries: Array.isArray(body.log_entries) ? parseDentistLogJson(body.log_entries) : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

/** Retrieve stored dentist log + discrepancies for a payslip (legacy GET). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:view");
    const { id: payPeriodId } = await params;
    const payslipEntryId = new URL(req.url).searchParams.get("payslipEntryId") ?? new URL(req.url).searchParams.get("entry_id");
    if (!payslipEntryId) {
      return NextResponse.json({ error: "payslipEntryId required" }, { status: 400 });
    }

    const db = scopedDb(session.practiceId);
    const payslip = await db.payslipEntry.findFirst({
      where: { id: payslipEntryId, payPeriodId, practiceId: session.practiceId },
      select: { dentallyDentistLogJson: true, dentallyDiscrepanciesJson: true },
    });
    if (!payslip) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

    return NextResponse.json({
      log: parseDentistLogJson(payslip.dentallyDentistLogJson),
      discrepancies: parsePayDiscrepancies(payslip.dentallyDiscrepanciesJson),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
