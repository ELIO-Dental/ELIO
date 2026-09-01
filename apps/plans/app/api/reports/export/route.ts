import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { buildReportsCsv } from "@/lib/reports-service";

/** CSV export for reports (P3.4 — owner/admin/finance). */
export async function GET() {
  try {
    const session = await requirePermission("plans:view-payments");
    const csv = await buildReportsCsv(session.practiceId);
    const date = new Date().toISOString().split("T")[0];
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="elio-plans-reports-${date}.csv"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
