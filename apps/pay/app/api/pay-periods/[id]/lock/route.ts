import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { snapshotPayslipVersionsOnLock } from "@/lib/payslip-version";
import { recordPayAudit } from "@/lib/pay-audit";

/**
 * Locks a pay period — after this, PayslipEntry rows are never recalculated.
 * Step 26: also snapshots each payslip PDF as an immutable PayslipVersion.
 * Step 29: refuse finalize while any payslip is still provisional.
 * Step 31: audit finalize.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({ where: { id }, include: { payslipEntries: true } });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (payPeriod.status === "LOCKED") {
      return NextResponse.json({ error: "Pay period is already locked" }, { status: 409 });
    }
    if (payPeriod.payslipEntries.length === 0) {
      return NextResponse.json({ error: "Cannot lock a pay period with no calculated payslips" }, { status: 400 });
    }

    const provisionalEntries = payPeriod.payslipEntries.filter((p) => p.provisional);
    if (provisionalEntries.length > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot finalize while provisional payslips remain — confirm finance term and/or fee on all finance lines, then recalculate.",
          provisionalCount: provisionalEntries.length,
        },
        { status: 400 }
      );
    }

    const lockedAt = new Date();
    const locked = await db.payPeriod.update({
      where: { id },
      data: { status: "LOCKED", lockedAt },
    });

    const versions = await snapshotPayslipVersionsOnLock(session.practiceId, id, lockedAt);

    await recordPayAudit(session, {
      action: "pay.period.locked",
      targetType: "PayPeriod",
      targetId: id,
      metadata: {
        before: { status: payPeriod.status, lockedAt: payPeriod.lockedAt },
        after: { status: locked.status, lockedAt: locked.lockedAt },
        versionsCreated: versions.created,
      },
    });

    return NextResponse.json({ payPeriod: locked, versionsCreated: versions.created });
  } catch (err) {
    return errorResponse(err);
  }
}
