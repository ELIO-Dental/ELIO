import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/**
 * Locks a pay period — after this, PayslipEntry rows are never recalculated (versioning,
 * DATA_MODEL.md §3). PERMISSIONS_MATRIX.md §3: only roles with pay:run-period may lock.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:run-period");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({ where: { id }, include: { payslipEntries: true } });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (payPeriod.payslipEntries.length === 0) {
      return NextResponse.json({ error: "Cannot lock a pay period with no calculated payslips" }, { status: 400 });
    }

    const locked = await db.payPeriod.update({
      where: { id },
      data: { status: "LOCKED", lockedAt: new Date() },
    });
    return NextResponse.json({ payPeriod: locked });
  } catch (err) {
    return errorResponse(err);
  }
}
