import { NextResponse } from "next/server";
import { normalizeBillPaidInput } from "@/lib/bill-paid";
import { deleteLabBill, updateLabBill, updateLabBillPaid } from "@/lib/pay-service";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";

/** Update or delete a lab bill (legacy Y3.3). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    if (body.paid !== undefined || body.paid_date !== undefined || body.paidAt !== undefined) {
      const { paid, paidAt } = normalizeBillPaidInput({
        paid: body.paid as boolean | number | string | null | undefined,
        paid_date: typeof body.paid_date === "string" ? body.paid_date : undefined,
        paidAt: typeof body.paidAt === "string" || body.paidAt instanceof Date ? (body.paidAt as string | Date) : undefined,
      });
      const labBill = await updateLabBillPaid(session.practiceId, id, paid, paidAt);
      return NextResponse.json({ ok: true, labBill });
    }

    const labBill = await updateLabBill(session.practiceId, id, {
      dentistId: (body.dentistId ?? body.dentist_id) as string | null | undefined,
      savedLabId: body.savedLabId as string | null | undefined,
      labName: (body.labName ?? body.lab_name) as string | null | undefined,
      amountPence: body.amountPence != null ? Number(body.amountPence) : body.amount != null ? Math.round(Number(body.amount) * 100) : undefined,
      description: body.description as string | null | undefined,
      fileUrl: (body.fileUrl ?? body.file_url) as string | null | undefined,
      billDate: (body.billDate ?? body.date) as string | null | undefined,
    });
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const { id } = await params;
    await deleteLabBill(session.practiceId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Lab bill not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
