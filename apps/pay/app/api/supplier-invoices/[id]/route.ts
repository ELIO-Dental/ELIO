import { NextResponse } from "next/server";
import { scopedDb } from "@elio/db";
import { normalizeBillPaidInput } from "@/lib/bill-paid";
import {
  deleteSupplierInvoice,
  updateSupplierInvoice,
  updateSupplierInvoicePaid,
} from "@/lib/pay-service";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { errorResponse } from "@/lib/api-error";
import { recordPayAudit } from "@/lib/pay-audit";

/** Update or delete a supplier invoice (AuraPay parity with lab bills). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const db = scopedDb(session.practiceId);
    const before = await db.supplierInvoiceEntry.findFirst({
      where: { id, practiceId: session.practiceId },
      select: {
        dentistId: true,
        supplierId: true,
        amountPence: true,
        description: true,
        invoiceNumber: true,
        paid: true,
        paidAt: true,
      },
    });
    if (!before) return NextResponse.json({ error: "Supplier invoice not found" }, { status: 404 });

    if (body.paid !== undefined || body.paid_date !== undefined || body.paidAt !== undefined) {
      const { paid, paidAt } = normalizeBillPaidInput({
        paid: body.paid as boolean | number | string | null | undefined,
        paid_date: typeof body.paid_date === "string" ? body.paid_date : undefined,
        paidAt:
          typeof body.paidAt === "string" || body.paidAt instanceof Date
            ? (body.paidAt as string | Date)
            : undefined,
      });
      const supplierInvoice = await updateSupplierInvoicePaid(session.practiceId, id, paid, paidAt);
      await recordPayAudit(session, {
        action: "pay.supplier_invoice.paid_updated",
        targetType: "SupplierInvoiceEntry",
        targetId: id,
        metadata: {
          before: { paid: before.paid, paidAt: before.paidAt },
          after: { paid: supplierInvoice.paid, paidAt: supplierInvoice.paidAt },
        },
      });
      return NextResponse.json({ ok: true, supplierInvoice });
    }

    const supplierInvoice = await updateSupplierInvoice(session.practiceId, id, {
      dentistId: (body.dentistId ?? body.dentist_id) as string | null | undefined,
      supplierId: (body.supplierId ?? body.supplier_id) as string | null | undefined,
      amountPence:
        body.amountPence != null
          ? Number(body.amountPence)
          : body.amount != null
            ? Math.round(Number(body.amount) * 100)
            : undefined,
      description: body.description as string | null | undefined,
      invoiceNumber: (body.invoiceNumber ?? body.invoice_number) as string | null | undefined,
      fileUrl: (body.fileUrl ?? body.file_url) as string | null | undefined,
      invoiceDate: (body.invoiceDate ?? body.date) as string | null | undefined,
    });
    await recordPayAudit(session, {
      action: "pay.supplier_invoice.updated",
      targetType: "SupplierInvoiceEntry",
      targetId: id,
      metadata: {
        before,
        after: {
          dentistId: supplierInvoice.dentistId,
          supplierId: supplierInvoice.supplierId,
          amountPence: supplierInvoice.amountPence,
          invoiceNumber: supplierInvoice.invoiceNumber,
          description: supplierInvoice.description,
        },
      },
    });
    return NextResponse.json({ ok: true, supplierInvoice });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Supplier invoice not found") {
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
    const before = await db.supplierInvoiceEntry.findFirst({
      where: { id, practiceId: session.practiceId },
      select: {
        dentistId: true,
        supplierId: true,
        amountPence: true,
        invoiceNumber: true,
        description: true,
      },
    });
    await deleteSupplierInvoice(session.practiceId, id);
    await recordPayAudit(session, {
      action: "pay.supplier_invoice.deleted",
      targetType: "SupplierInvoiceEntry",
      targetId: id,
      metadata: { before },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof Error && err.message === "Supplier invoice not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    return errorResponse(err);
  }
}
