import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { listPayPeriods, createPayPeriodForTrigger } from "@/lib/pay-service";

export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const periods = await listPayPeriods(session.practiceId);
    return NextResponse.json({ periods });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Creates the DRAFT period for a trigger date, e.g. `{ "triggerDate": "2026-07-15" }`
 * pays for June 1-30 per BUG-2's half-open interval (§6.0). */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:run-period");
    const { triggerDate } = await req.json();
    if (typeof triggerDate !== "string") {
      return NextResponse.json({ error: "triggerDate (YYYY-MM-DD) required" }, { status: 400 });
    }
    const period = await createPayPeriodForTrigger(session.practiceId, triggerDate);
    return NextResponse.json({ period }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
