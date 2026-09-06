import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { ForbiddenError, UnauthorizedError, requirePermission } from "@/lib/session";
import { buildOpsReviewList } from "@/lib/ops-review";
import { flattenPayslipLinesForOpsReview } from "@/lib/ops-review-lines";
import { isAlreadyPaidInOtherPeriod } from "@/lib/paid-invoice-line-log";
import { loadPaidLogLookup } from "@/lib/paid-invoice-line-log-db";

/** GET — ops review list for a pay period (Step 30: ops-only via pay:run-period). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const period = await db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: {
          include: {
            dentist: true,
            privateRevenueLineItems: true,
          },
        },
      },
    });
    if (!period) {
      return NextResponse.json({ error: "Pay period not found" }, { status: 404 });
    }

    const prior = await db.payPeriod.findFirst({
      where: { periodEnd: { lt: period.periodStart } },
      orderBy: { periodEnd: "desc" },
      include: {
        payslipEntries: {
          include: {
            dentist: true,
            privateRevenueLineItems: true,
          },
        },
      },
    });

    const currentLines = flattenPayslipLinesForOpsReview(period.payslipEntries);
    const paidLogLookup = await loadPaidLogLookup(db, session.practiceId);
    const paidLogDuplicateHits = currentLines
      .map((line) => {
        const prior = isAlreadyPaidInOtherPeriod(line, paidLogLookup, period.id, line.dentistId);
        return prior ? { line, priorPeriodId: prior.payPeriodId } : null;
      })
      .filter((x): x is { line: (typeof currentLines)[number]; priorPeriodId: string } => Boolean(x));

    const items = buildOpsReviewList({
      currentLines,
      priorPaidLines: prior ? flattenPayslipLinesForOpsReview(prior.payslipEntries) : [],
      priorPeriodId: prior?.id ?? null,
      fetchResultJson: period.dentallyFetchResultJson,
      paidLogDuplicateHits,
    });

    return NextResponse.json({ ok: true, items, priorPeriodId: prior?.id ?? null });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
