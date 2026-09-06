import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { recordPayAudit } from "@/lib/pay-audit";
import { deletePaidLogForPeriod } from "@/lib/paid-invoice-line-log-db";

/** Reopens a locked pay period (legacy finalize route with status draft, Y2.1 / Step 31). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({ where: { id } });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (payPeriod.status !== "LOCKED") {
      return NextResponse.json({ error: "Period is not locked" }, { status: 400 });
    }

    const reopened = await db.payPeriod.update({
      where: { id },
      data: { status: "DRAFT", lockedAt: null },
    });

    // Step 26/28 — clear versioned PDF links so accordion regenerates live draft PDFs.
    await db.payslipEntry.updateMany({
      where: { payPeriodId: id, practiceId: session.practiceId },
      data: { pdfUrl: null },
    });

    // Step 14 — unlock releases this period's paid-log claims so lines can be
    // reassigned / corrected; re-calc / re-lock will rewrite the log.
    await deletePaidLogForPeriod(db, session.practiceId, id);

    await recordPayAudit(session, {
      action: "pay.period.unlocked",
      targetType: "PayPeriod",
      targetId: id,
      metadata: {
        before: { status: payPeriod.status, lockedAt: payPeriod.lockedAt },
        after: { status: reopened.status, lockedAt: reopened.lockedAt },
      },
    });

    return NextResponse.json({ payPeriod: reopened });
  } catch (err) {
    return errorResponse(err);
  }
}
