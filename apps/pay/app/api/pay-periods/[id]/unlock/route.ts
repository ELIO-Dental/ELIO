import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Reopens a locked pay period (legacy finalize route with status draft, Y2.1). */
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
    return NextResponse.json({ payPeriod: reopened });
  } catch (err) {
    return errorResponse(err);
  }
}
