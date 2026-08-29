import { NextRequest, NextResponse } from "next/server";
import { auth } from "@elio/auth";
import { prisma } from "@elio/db";
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
 * F.5 Final QA (2026-08-29) — REAL GAP FOUND AND FIXED: this route required
 * an explicit `practiceId` query param even for real Vercel-Cron-secret
 * calls, and apps/plans had NO vercel.json at all (confirmed: this route was
 * never actually scheduled to run in production, same class of gap as
 * apps/plans/app/api/cron/create-charges' own closeout comment — see there
 * for the full story). A bare Vercel Cron trigger (no query params, which is
 * exactly how Vercel invokes a scheduled cron) would have 400'd immediately
 * even once genuinely scheduled. Fixed to iterate every real practice when
 * called via cron secret with no explicit practiceId, mirroring apps/shell's
 * own dentally-sync cron's real multi-practice pattern.
 *
 * Query params: ?period=YYYY-MM (optional; defaults to the current month).
 * ?practiceId=... (optional for cron-secret calls; reconciles only that one
 * practice instead of every practice — still required/implicit for a signed-
 * in staff session, which is always scoped to their own practice).
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
    practiceId = request.nextUrl.searchParams.get("practiceId");
  }

  try {
    if (practiceId) {
      const result = await runReconciliation(practiceId, period);
      return NextResponse.json(result);
    }

    // Real Vercel Cron invocation (cron secret, no explicit practiceId) —
    // reconcile every real, non-suspended practice, one at a time.
    const practices = await prisma.practice.findMany({ where: { suspendedAt: null }, select: { id: true } });
    const results = await Promise.allSettled(
      practices.map(async (p) => ({ practiceId: p.id, ...(await runReconciliation(p.id, period)) })),
    );
    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof runReconciliation>> & { practiceId: string }> => r.status === "fulfilled")
      .map((r) => r.value);
    const failed = results.filter((r) => r.status === "rejected").length;
    const totalMismatches = succeeded.reduce((sum, r) => sum + r.counts.mismatches, 0);
    return NextResponse.json({ period, practices: practices.length, failed, totalMismatches, results: succeeded });
  } catch (error) {
    console.error("[Reconcile] Error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Reconciliation failed: ${detail}`, period }, { status: 502 });
  }
}
