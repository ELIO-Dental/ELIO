import { NextResponse } from "next/server";
import { requirePermission, UnauthorizedError, ForbiddenError } from "@/lib/session";
import { listLabBills, listSupplierInvoices } from "@/lib/pay-service";

// GET all lab bills + supplier invoices for the bulk payments screen.
//
// NOTE (see apps/pay/app/bulk-payments/page.tsx for full context): unlike
// aurapay's reference implementation, LabBillEntry/SupplierInvoiceEntry here
// have no `paid` flag and SavedLab/SavedSupplier have no bank-detail fields
// (account name / sort code / account number). No schema migration was made
// for this screen, so this endpoint returns ALL entries (not just "unpaid")
// and the CSV export uses the dentist/supplier name only, with no bank
// details column. See final report for details.
export async function GET() {
  try {
    const session = await requirePermission("pay:view");
    const [labBills, supplierInvoices] = await Promise.all([
      listLabBills(session.practiceId),
      listSupplierInvoices(session.practiceId),
    ]);

    return NextResponse.json({
      labBills: labBills.map((b) => ({
        id: b.id,
        type: "lab" as const,
        entityName: b.dentist?.name ?? "Unassigned",
        amountPence: b.amountPence,
        description: b.description,
        date: b.createdAt.toISOString(),
      })),
      supplierInvoices: supplierInvoices.map((i) => ({
        id: i.id,
        type: "supplier" as const,
        entityName: i.supplier?.name ?? "Unassigned",
        amountPence: i.amountPence,
        description: i.description,
        date: (i.invoiceDate ?? i.createdAt).toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
