import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { getReportingData } from "@/lib/pay-service";

/** §5.15 — read-only aggregated pay-period totals for the Reporting screen's chart. */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const periods = await getReportingData(session.practiceId);
    return NextResponse.json({ periods });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
