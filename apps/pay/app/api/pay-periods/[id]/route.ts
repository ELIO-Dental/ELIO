import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { requirePermission } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:view");
    const { id } = await params;
    const db = scopedDb(session.practiceId);

    const payPeriod = await db.payPeriod.findUnique({
      where: { id },
      include: {
        payslipEntries: { include: { dentist: true, privateRevenueLineItems: true } },
        compassStatements: { include: { lines: { include: { dentist: true } } } },
      },
    });
    if (!payPeriod) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ payPeriod });
  } catch (err) {
    return errorResponse(err);
  }
}
