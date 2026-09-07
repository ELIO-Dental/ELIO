import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import {
  listPayPeriods,
  createPayPeriodForTrigger,
  createPayPeriodForMonthYear,
} from "@/lib/pay-service";

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

/**
 * Create DRAFT pay period — AuraPay parity: `{ month, year }` (calendar month being paid).
 * Also accepts `{ triggerDate: "YYYY-MM-DD" }` (§6.0 15th → previous month).
 */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:run-period");
    const body = (await req.json()) as { month?: number; year?: number; triggerDate?: string };

    if (typeof body.month === "number" && typeof body.year === "number") {
      if (!Number.isInteger(body.month) || body.month < 1 || body.month > 12) {
        return NextResponse.json({ error: "Invalid month (must be 1-12)" }, { status: 400 });
      }
      if (!Number.isInteger(body.year) || body.year < 2020 || body.year > 2100) {
        return NextResponse.json({ error: "Invalid year" }, { status: 400 });
      }
      const { period, created } = await createPayPeriodForMonthYear(
        session.practiceId,
        body.month,
        body.year
      );
      // 200 = already existed for that month (no duplicate); 201 = newly created.
      return NextResponse.json({ period, created }, { status: created ? 201 : 200 });
    }

    if (typeof body.triggerDate === "string") {
      const { period, created } = await createPayPeriodForTrigger(session.practiceId, body.triggerDate);
      return NextResponse.json({ period, created }, { status: created ? 201 : 200 });
    }

    return NextResponse.json(
      { error: "month and year (or triggerDate YYYY-MM-DD) required" },
      { status: 400 }
    );
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
