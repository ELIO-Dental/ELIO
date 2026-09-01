import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { getReportingData } from "@/lib/pay-service";
import { getBillsReportingData } from "@/lib/bills-reporting-service";

/** §5.15 + Y4.1 — pay-period chart data and bills reporting aggregates. */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const [periods, bills] = await Promise.all([
      getReportingData(session.practiceId),
      getBillsReportingData(session.practiceId),
    ]);
    return NextResponse.json({ periods, ...bills });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
