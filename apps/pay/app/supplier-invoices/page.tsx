import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { PayNav } from "@/components/pay-nav";
import { SupplierInvoicesClient } from "./supplier-invoices-client";

export default async function SupplierInvoicesPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const db = scopedDb(session.practiceId);
  const [supplierInvoices, suppliers] = await Promise.all([
    db.supplierInvoiceEntry.findMany({
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.savedSupplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-(--color-text-primary)">Supplier Invoices</h1>
        </div>

        <SupplierInvoicesClient
          initialSupplierInvoices={supplierInvoices.map((i) => ({
            id: i.id,
            supplierId: i.supplierId,
            supplierName: i.supplier?.name ?? null,
            amountPence: i.amountPence,
            description: i.description,
            invoiceDate: i.invoiceDate ? i.invoiceDate.toISOString() : null,
            createdAt: i.createdAt.toISOString(),
          }))}
          suppliers={suppliers}
        />
      </div>
    </div>
  );
}
