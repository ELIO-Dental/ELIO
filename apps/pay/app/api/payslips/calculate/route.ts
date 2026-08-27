import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { calculatePayslipForDentist } from "@/lib/pay-service";

/**
 * §6.3-6.5 — runs the full pay-engine calculation for one dentist in one
 * period and persists a PayslipEntry showing every source figure.
 *
 * Per PERFORMANCE_SCALABILITY.md §1 this should run as a background job for
 * a full-practice pay run (all dentists at once); this route calculates one
 * dentist synchronously, which is fine for the manual "recalculate this one"
 * action but the bulk "run period" trigger is NOT yet wired to a queue/job
 * (flagged in the final report — not built this session).
 */
export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:run-period");
    const { payPeriodId, dentistId } = await req.json();
    if (typeof payPeriodId !== "string" || typeof dentistId !== "string") {
      return NextResponse.json({ error: "payPeriodId and dentistId are required" }, { status: 400 });
    }
    const entry = await calculatePayslipForDentist(session.practiceId, payPeriodId, dentistId);
    return NextResponse.json({ payslipEntry: entry });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
