import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { listLabBills, listSupplierInvoices } from "@/lib/pay-service";
import { PageContent, PageHeader } from "@elio/ui";
import { BulkPaymentsClient } from "./bulk-payments-client";

export default async function BulkPaymentsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const [labBills, supplierInvoices] = await Promise.all([
    listLabBills(session.practiceId),
    listSupplierInvoices(session.practiceId),
  ]);

  return (
    <PageContent>
      <PageHeader title="Bulk Payments" description="Review and export lab and supplier payments together." />

      <div className="mt-8">
        <BulkPaymentsClient
          initialItems={[
            ...labBills.map((b) => ({
              id: b.id,
              type: "lab" as const,
              entityName: b.dentist?.name ?? "Unassigned",
              amountPence: b.amountPence,
              description: b.description,
              date: b.createdAt.toISOString(),
            })),
            ...supplierInvoices.map((i) => ({
              id: i.id,
              type: "supplier" as const,
              entityName: i.supplier?.name ?? "Unassigned",
              amountPence: i.amountPence,
              description: i.description,
              date: (i.invoiceDate ?? i.createdAt).toISOString(),
            })),
          ]}
        />
      </div>
    </PageContent>
  );
}
