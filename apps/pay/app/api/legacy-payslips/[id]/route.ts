import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import {
  formatLegacyPeriodLabel,
  legacyPayslipAdjustments,
  legacyPayslipLabBills,
  legacyPayslipPatients,
  legacyPayslipSummary,
  parseLegacyPayslipRow,
} from "@/lib/legacy-payslip-archive";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Single migrated legacy payslip (read-only, Y2.10). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:view");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const row = await db.legacyPayslipArchive.findFirst({
      where: { id, practiceId: session.practiceId },
    });
    if (!row) return NextResponse.json({ error: "Legacy payslip not found" }, { status: 404 });

    const parsed = parseLegacyPayslipRow(row.rawRowJson);
    const summary = legacyPayslipSummary(parsed);

    return NextResponse.json({
      id: row.id,
      sourceId: row.sourceId,
      dentistName: row.dentistName,
      periodLabel: formatLegacyPeriodLabel(row.periodMonth, row.periodYear),
      periodMonth: row.periodMonth,
      periodYear: row.periodYear,
      migratedAt: row.migratedAt.toISOString(),
      summary,
      patients: legacyPayslipPatients(parsed),
      labBills: legacyPayslipLabBills(parsed),
      adjustments: legacyPayslipAdjustments(parsed),
      rawRowJson: parsed,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
