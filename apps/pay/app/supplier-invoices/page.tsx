import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
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
    <PageContent>
      <PageHeader title="Supplier Invoices" description="Record supplier invoices for bulk payment runs." />

      <div className="mt-8">
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
    </PageContent>
  );
}
