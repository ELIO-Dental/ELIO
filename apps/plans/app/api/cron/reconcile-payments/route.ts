import { NextRequest, NextResponse } from "next/server";
import { auth } from "@elio/auth";
import { billingPeriodFromDate } from "@elio/plans-engine";
import { runReconciliation } from "@/lib/plans-service";

export const runtime = "nodejs";

/**
 * GET /api/cron/reconcile-payments — daily reconciliation for BUG-1
 * (MASTER_BUILD_GUIDE.md §1.7). Compares ELIO's expected membership charges
 * and locally-recorded PlanPayment rows against GoCardless's actual payments
 * for a billing period, and returns every mismatch. Runs from Vercel Cron
 * (CRON_SECRET) or a signed-in staff session with plans:resolve-mismatch;
 * mirrors ElioPlans' real production cron route
 * (D:\WEB DEV\Hish\ElioPlans\src\app\api\cron\reconcile-payments\route.ts)
 * functionally, re-housed on top of scopedDb() for tenant isolation — every
 * practice's active plan is reconciled in its own scope, one at a time.
 *
 * Query params: ?period=YYYY-MM (optional; defaults to the current month).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasValidCronSecret = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let practiceId: string | null = null;
  if (!hasValidCronSecret) {
    const session = await auth();
    const allowedRoles = ["SUPER_ADMIN", "OWNER", "ADMIN", "FINANCE", "AUDITOR"];
    if (session?.userId && session.practiceId && allowedRoles.includes(session.role ?? "")) {
      practiceId = session.practiceId;
    }
  }
  if (!hasValidCronSecret && !practiceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const periodParam = request.nextUrl.searchParams.get("period");
  const period = periodParam || billingPeriodFromDate(new Date());
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "Invalid period, expected YYYY-MM" }, { status: 400 });
  }

  if (!practiceId) {
    const requestedPracticeId = request.nextUrl.searchParams.get("practiceId");
    if (!requestedPracticeId) {
      return NextResponse.json({ error: "practiceId query param required for cron-secret calls" }, { status: 400 });
    }
    practiceId = requestedPracticeId;
  }

  try {
    const result = await runReconciliation(practiceId, period);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Reconcile] Error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Reconciliation failed: ${detail}`, period }, { status: 502 });
  }
}
