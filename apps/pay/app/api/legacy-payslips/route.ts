import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { formatLegacyPeriodLabel, legacyPayslipSummary, parseLegacyPayslipRow } from "@/lib/legacy-payslip-archive";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** List migrated legacy payslips (read-only, Y2.10). */
export async function GET(req: Request) {
  try {
    const session = await requirePermission("pay:view");
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const pageSize = 25;
    const skip = (page - 1) * pageSize;
    const dentist = url.searchParams.get("dentist")?.trim();
    const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined;

    const db = scopedDb(session.practiceId);
    const where = {
      ...(dentist ? { dentistName: { contains: dentist, mode: "insensitive" as const } } : {}),
      ...(year ? { periodYear: year } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      db.legacyPayslipArchive.findMany({
        where,
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { dentistName: "asc" }],
        skip,
        take: pageSize,
      }),
      db.legacyPayslipArchive.count({ where }),
    ]);

    return NextResponse.json({
      page,
      pageSize,
      totalCount,
      items: rows.map((row) => {
        const parsed = parseLegacyPayslipRow(row.rawRowJson);
        const summary = legacyPayslipSummary(parsed);
        return {
          id: row.id,
          sourceId: row.sourceId,
          dentistName: row.dentistName,
          periodLabel: formatLegacyPeriodLabel(row.periodMonth, row.periodYear),
          periodMonth: row.periodMonth,
          periodYear: row.periodYear,
          migratedAt: row.migratedAt.toISOString(),
          grossPrivate: summary.grossPrivate,
          nhsUdas: summary.nhsUdas,
          patientCount: summary.patientCount,
        };
      }),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
