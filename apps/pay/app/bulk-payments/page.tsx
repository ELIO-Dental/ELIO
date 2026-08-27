import { redirectToLogin } from "@/lib/session";
import { auth } from "@elio/auth";
import { PayNav } from "@/components/pay-nav";
import { listLabBills, listSupplierInvoices } from "@/lib/pay-service";
import { BulkPaymentsClient } from "./bulk-payments-client";

export default async function BulkPaymentsPage() {
  const session = await auth();
  if (!session?.practiceId) return redirectToLogin();

  const [labBills, supplierInvoices] = await Promise.all([
    listLabBills(session.practiceId),
    listSupplierInvoices(session.practiceId),
  ]);

  return (
    <div>
      <PayNav isOwner={session.role === "OWNER"} />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-(--color-text-primary)">Bulk Payments</h1>
        </div>

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
    </div>
  );
}
