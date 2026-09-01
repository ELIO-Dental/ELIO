import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { listLabBills, listSupplierInvoices } from "@/lib/pay-service";

/** Unpaid lab bills + supplier invoices for bulk payments (legacy Y3.4 foundation). */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const [labBills, supplierInvoices] = await Promise.all([
      listLabBills(session.practiceId),
      listSupplierInvoices(session.practiceId),
    ]);

    return NextResponse.json({
      labBills: labBills
        .filter((b) => !b.paid)
        .map((b) => ({
          id: b.id,
          type: "lab" as const,
          entityName: b.dentist?.name ?? "Unassigned",
          amountPence: b.amountPence,
          description: b.description,
          paid: b.paid,
          paidAt: b.paidAt?.toISOString() ?? null,
          date: b.createdAt.toISOString(),
        })),
      supplierInvoices: supplierInvoices
        .filter((i) => !i.paid)
        .map((i) => ({
          id: i.id,
          type: "supplier" as const,
          entityName: i.supplier?.name ?? "Unassigned",
          amountPence: i.amountPence,
          description: i.description,
          paid: i.paid,
          paidAt: i.paidAt?.toISOString() ?? null,
          date: (i.invoiceDate ?? i.createdAt).toISOString(),
        })),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
