import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { importDentistLogForPayslip } from "@/lib/import-dentist-log";
import {
  fetchGoogleSheetTakings,
  resolveTakingsSpreadsheetIds,
} from "@/lib/google-sheets-takings";
import { getPaySettings } from "@/lib/pay-settings-service";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

function handleError(err: unknown) {
  const message = err instanceof Error ? err.message : "Request failed";
  if (message === "Pay period is locked") return NextResponse.json({ error: message }, { status: 409 });
  if (message === "Payslip not found") return NextResponse.json({ error: message }, { status: 404 });
  if (message === "No valid log entries found") return NextResponse.json({ error: message }, { status: 400 });
  return errorResponse(err);
}

/** Import dentist private log from a public Google Sheet CSV export (AuraPay parity). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:manual-adjustment");
    const { id: payPeriodId } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    const payslipEntryId = String(body.payslipEntryId ?? body.entry_id ?? "");
    if (!payslipEntryId) {
      return NextResponse.json({ error: "payslipEntryId required" }, { status: 400 });
    }

    const db = scopedDb(session.practiceId);
    const [period, payslip, paySettings] = await Promise.all([
      db.payPeriod.findFirst({
        where: { id: payPeriodId, practiceId: session.practiceId },
        select: { periodStart: true },
      }),
      db.payslipEntry.findFirst({
        where: { id: payslipEntryId, payPeriodId, practiceId: session.practiceId },
        select: { dentist: { select: { name: true } } },
      }),
      getPaySettings(session.practiceId),
    ]);

    if (!period) return NextResponse.json({ error: "Pay period not found" }, { status: 404 });
    if (!payslip) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });

    const dentistName =
      (typeof body.dentistName === "string" && body.dentistName.trim()) ||
      (typeof body.dentist_name === "string" && body.dentist_name.trim()) ||
      payslip.dentist.name;

    const spreadsheetIds = resolveTakingsSpreadsheetIds(paySettings.takings_spreadsheet_ids);
    const spreadsheetId =
      (typeof body.spreadsheetId === "string" && body.spreadsheetId.trim()) ||
      (typeof body.spreadsheet_id === "string" && body.spreadsheet_id.trim()) ||
      spreadsheetIds[dentistName];

    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error: `No private takings log configured for ${dentistName}`,
          hint: "Configure takings_spreadsheet_ids in Pay settings (JSON map of dentist name → spreadsheet ID)",
        },
        { status: 404 }
      );
    }

    const month = period.periodStart.getUTCMonth() + 1;
    const year = period.periodStart.getUTCFullYear();
    const { rows, error: sheetError } = await fetchGoogleSheetTakings(spreadsheetId, month, year);

    if (rows.length === 0) {
      return NextResponse.json({
        ok: false,
        error: sheetError || `No entries found in ${dentistName}'s private log for ${month}/${year}`,
        count: 0,
      });
    }

    const result = await importDentistLogForPayslip(session.practiceId, payPeriodId, payslipEntryId, {
      logEntries: rows,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}
