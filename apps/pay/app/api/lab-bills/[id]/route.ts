import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { normalizeBillPaidInput } from "@/lib/bill-paid";
import { deleteLabBill, updateLabBill, updateLabBillPaid } from "@/lib/pay-service";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { recordPayAudit } from "@/lib/pay-audit";

/** Update or delete a lab bill (legacy Y3.3 / Step 31). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const db = scopedDb(session.practiceId);
    const before = await db.labBillEntry.findFirst({
      where: { id, practiceId: session.practiceId },
      select: {
        dentistId: true,
        amountPence: true,
        labName: true,
        description: true,
        paid: true,
        paidAt: true,
      },
    });
    if (!before) return NextResponse.json({ error: "Lab bill not found" }, { status: 404 });

    if (body.paid !== undefined || body.paid_date !== undefined || body.paidAt !== undefined) {
      const { paid, paidAt } = normalizeBillPaidInput({
        paid: body.paid as boolean | number | string | null | undefined,
        paid_date: typeof body.paid_date === "string" ? body.paid_date : undefined,
        paidAt:
          typeof body.paidAt === "string" || body.paidAt instanceof Date
            ? (body.paidAt as string | Date)
            : undefined,
      });
      const labBill = await updateLabBillPaid(session.practiceId, id, paid, paidAt);
      await recordPayAudit(session, {
        action: "pay.lab_bill.paid_updated",
        targetType: "LabBillEntry",
        targetId: id,
        metadata: {
          before: { paid: before.paid, paidAt: before.paidAt },
          after: { paid: labBill.paid, paidAt: labBill.paidAt },
        },
      });
      return NextResponse.json({ ok: true, labBill });
    }

    const labBill = await updateLabBill(session.practiceId, id, {
      dentistId:
        "dentistId" in body
          ? ((body.dentistId as string | null) ?? null)
          : "dentist_id" in body
            ? ((body.dentist_id as string | null) ?? null)
            : undefined,
      savedLabId:
        "savedLabId" in body ? ((body.savedLabId as string | null) ?? null) : undefined,
      labName:
        "labName" in body
          ? ((body.labName as string | null) ?? null)
          : "lab_name" in body
            ? ((body.lab_name as string | null) ?? null)
            : undefined,
      amountPence:
        body.amountPence != null
          ? Number(body.amountPence)
          : body.amount != null
            ? Math.round(Number(body.amount) * 100)
            : undefined,
      description:
        "description" in body ? ((body.description as string | null) ?? null) : undefined,
      fileUrl:
        "fileUrl" in body
          ? ((body.fileUrl as string | null) ?? null)
          : "file_url" in body
            ? ((body.file_url as string | null) ?? null)
            : undefined,
      billDate:
        "billDate" in body
          ? ((body.billDate as string | null) ?? null)
          : "date" in body
            ? ((body.date as string | null) ?? null)
            : undefined,
    });
    await recordPayAudit(session, {
      action: "pay.lab_bill.updated",
      targetType: "LabBillEntry",
      targetId: id,
      metadata: {
        before,
        after: {
          dentistId: labBill.dentistId,
          amountPence: labBill.amountPence,
          labName: labBill.labName,
          description: labBill.description,
        },
      },
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
    const db = scopedDb(session.practiceId);
    const before = await db.labBillEntry.findFirst({
      where: { id, practiceId: session.practiceId },
      select: { dentistId: true, amountPence: true, labName: true, description: true },
    });
    await deleteLabBill(session.practiceId, id);
    await recordPayAudit(session, {
      action: "pay.lab_bill.deleted",
      targetType: "LabBillEntry",
      targetId: id,
      metadata: { before },
    });
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
