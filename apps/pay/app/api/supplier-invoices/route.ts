import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { listSupplierInvoices, createSupplierInvoice } from "@/lib/pay-service";
import { recordPayAudit } from "@/lib/pay-audit";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("pay:view");
    const { searchParams } = new URL(req.url);
    const supplierName = searchParams.get("supplierName") ?? undefined;
    const dentistId = searchParams.get("dentistId") ?? undefined;
    const year = searchParams.get("year") ? Number(searchParams.get("year")) : undefined;
    const month = searchParams.get("month") ? Number(searchParams.get("month")) : undefined;
    const supplierInvoices = await listSupplierInvoices(session.practiceId, {
      supplierName,
      dentistId,
      year,
      month,
    });
    return NextResponse.json({ supplierInvoices });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("pay:edit-bills");
    const body = await req.json();
    const supplierInvoice = await createSupplierInvoice(session.practiceId, {
      supplierId: body.supplierId ?? body.supplier_id ?? null,
      dentistId: body.dentistId ?? body.dentist_id ?? null,
      amountPence: Number(body.amountPence ?? Math.round(Number(body.amount) * 100)),
      description: body.description ?? null,
      invoiceNumber: body.invoiceNumber ?? body.invoice_number ?? null,
      fileUrl: body.fileUrl ?? body.file_url ?? null,
      invoiceDate: body.invoiceDate ?? body.date ?? null,
    });
    await recordPayAudit(session, {
      action: "pay.supplier_invoice.created",
      targetType: "SupplierInvoiceEntry",
      targetId: supplierInvoice.id,
      metadata: {
        after: {
          supplierId: supplierInvoice.supplierId,
          dentistId: supplierInvoice.dentistId,
          amountPence: supplierInvoice.amountPence,
          invoiceNumber: supplierInvoice.invoiceNumber,
          description: supplierInvoice.description,
        },
      },
    });
    return NextResponse.json({ supplierInvoice }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });
  }
}
