import { NextResponse } from "next/server";
import { normalizeBillPaidInput } from "@/lib/bill-paid";
import { updateLabBillPaid } from "@/lib/pay-service";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Update lab bill paid state (legacy PUT /api/bills/lab, Y3.1). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const { paid, paidAt } = normalizeBillPaidInput({
      paid: body.paid as boolean | number | string | null | undefined,
      paid_date: typeof body.paid_date === "string" ? body.paid_date : undefined,
      paidAt: typeof body.paidAt === "string" || body.paidAt instanceof Date ? (body.paidAt as string | Date) : undefined,
    });

    const labBill = await updateLabBillPaid(session.practiceId, id, paid, paidAt);
    return NextResponse.json({ ok: true, labBill });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Lab bill not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
