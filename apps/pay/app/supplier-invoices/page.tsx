import { redirectToLogin, redirectUnlessPayViewAll } from "@/lib/session";
import { auth } from "@elio/auth";
import type { Role } from "@elio/db";
import { scopedDb } from "@elio/db";
import { PageContent, PageHeader } from "@elio/ui";
import { SupplierInvoicesClient } from "./supplier-invoices-client";
import type { SupplierInvoiceListItem } from "@/lib/supplier-invoices-summary";
import { ACTIVE_DENTIST_WHERE } from "@/lib/active-dentists";

export default async function SupplierInvoicesPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();
  await redirectUnlessPayViewAll(session.role as Role);

  const db = scopedDb(session.practiceId);
  const currentYear = new Date().getUTCFullYear();
  const [supplierInvoices, dentists, suppliers] = await Promise.all([
    db.supplierInvoiceEntry.findMany({
      include: {
        supplier: { select: { id: true, name: true } },
        dentist: { select: { id: true, name: true } },
      },
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    }),
    db.dentist.findMany({
      where: ACTIVE_DENTIST_WHERE,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.savedSupplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows: SupplierInvoiceListItem[] = supplierInvoices.map((i) => ({
    id: i.id,
    supplierId: i.supplierId,
    supplierName: i.supplier?.name ?? null,
    dentistId: i.dentistId,
    dentistName: i.dentist?.name ?? null,
    amountPence: i.amountPence,
    description: i.description,
    invoiceNumber: i.invoiceNumber,
    fileUrl: i.fileUrl,
    invoiceDate: i.invoiceDate?.toISOString() ?? null,
    paid: i.paid,
    paidAt: i.paidAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <PageContent>
      <PageHeader title="Supplier Invoices" description="Record supplier invoices for bulk payment runs." />

      <div className="mt-8">
        <SupplierInvoicesClient
          initialSupplierInvoices={rows}
          dentists={dentists}
          suppliers={suppliers}
          initialYear={currentYear}
        />
      </div>
    </PageContent>
  );
}
