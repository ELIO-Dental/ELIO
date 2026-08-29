import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { getConversionReport } from "@/lib/flow-service";

/** Conversion report, optionally filtered by ?from=&to= (ISO dates) — powers
 * the reporting screen's date-range filter. Defaults to all-time when unset.
 *
 * Found live (2026-08-29, independent Phase 2 audit): this route used bare
 * requireSession() — no permission check AND no licence check (middleware.ts
 * excludes /api from its matcher, same as every other route in this app, so
 * there was zero fallback protection). Any authenticated user, from ANY
 * practice regardless of FLOW licence status, could pull full conversion-
 * report data. Fixed to use requirePermission() like every other route in
 * this app — matches apps/pay/app/api/reporting/route.ts's identical
 * "pay:view" pattern for consistency. */
export async function GET(req: Request) {
  try {
    const session = await requirePermission("flow:view");

    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    let dateRange: { from: Date; to: Date } | undefined;
    if (fromParam && toParam) {
      const from = new Date(fromParam);
      const to = new Date(toParam);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return NextResponse.json({ error: "Invalid from/to date" }, { status: 400 });
      }
      dateRange = { from, to };
    }

    const result = await getConversionReport(session.practiceId, dateRange);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
