import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { listUnpaidBillsForBulkPayment } from "@/lib/bulk-payment";

/** Deprecated alias of GET /pay/api/bulk-payment — kept for old callers. */
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const unpaid = await listUnpaidBillsForBulkPayment(session.practiceId);
    return NextResponse.json({
      labBills: unpaid.lab_bills.map((b) => ({
        id: b.id,
        type: "lab" as const,
        entityName: b.entity_name,
        amountPence: b.amountPence,
        description: b.description,
        paid: false,
        date: b.date,
        accountName: b.account_name,
        sortCode: b.sort_code,
        accountNumber: b.account_number,
      })),
      supplierInvoices: unpaid.supplier_invoices.map((b) => ({
        id: b.id,
        type: "supplier" as const,
        entityName: b.entity_name,
        amountPence: b.amountPence,
        description: b.description,
        paid: false,
        date: b.date,
        accountName: b.account_name,
        sortCode: b.sort_code,
        accountNumber: b.account_number,
      })),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
