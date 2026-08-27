import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, EmptyState, Badge } from "@elio/ui";
import { PlansNav } from "@/components/plans-nav";
import { PaymentsFilterBar } from "./payments-filter-bar";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  PAID_OUT: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  CHARGED_BACK: "danger",
};

function money(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;

  const { status } = await searchParams;

  const payments = await prisma.planPayment.findMany({
    where: {
      practiceId,
      ...(status ? { status: status as "PENDING" | "CONFIRMED" | "PAID_OUT" | "FAILED" | "CANCELLED" | "CHARGED_BACK" } : {}),
    },
    include: { planPatient: { include: { patient: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PlansNav />
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-h2 text-(--color-text-primary)">Payments</h1>
        <p className="mt-1 text-body text-(--color-text-secondary)">
          Every recurring membership charge recorded for this practice.
        </p>

        <div className="mt-8">
          <PaymentsFilterBar />
          {payments.length === 0 ? (
            <div className="rounded-b-(--radius-lg) border border-t-0 border-(--color-border)">
              <EmptyState
                title="No payments match"
                description="Payments will appear here once billing periods run, or clear your filters."
              />
            </div>
          ) : (
            <div className="rounded-b-(--radius-lg) border border-t-0 border-(--color-border)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => {
                    const name =
                      [p.planPatient.patient.firstName, p.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                      "Unknown patient";
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{name}</TableCell>
                        <TableCell>{p.billingPeriod ?? "—"}</TableCell>
                        <TableCell className="tabular-nums font-(--font-mono)">{money(p.amountPence)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[p.status] ?? "neutral"}>{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-(--color-text-tertiary)">
                          {p.createdAt.toISOString().slice(0, 10)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
