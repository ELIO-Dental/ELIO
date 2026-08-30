import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  Badge,
  PageContent,
  PageHeader,
  TablePanel,
  TableCellMoney,
  formatMoneyGBP,
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { PaymentsFilterBar } from "./payments-filter-bar";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  PAID_OUT: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  CHARGED_BACK: "danger",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;

  const params = await searchParams;
  const { status } = params;
  const { page, skip, pageSize } = parseTablePage(params);

  const where = {
    practiceId,
    ...(status ? { status: status as "PENDING" | "CONFIRMED" | "PAID_OUT" | "FAILED" | "CANCELLED" | "CHARGED_BACK" } : {}),
  };

  const [payments, totalCount] = await Promise.all([
    prisma.planPayment.findMany({
      where,
      include: { planPatient: { include: { patient: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.planPayment.count({ where }),
  ]);

  return (
    <PageContent>
      <PageHeader title="Payments" description="Every recurring membership charge recorded for this practice." />

      <div className="mt-8">
        <TablePanel
          toolbar={
            <TableToolbar>
              <PaymentsFilterBar />
            </TableToolbar>
          }
          footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
        >
          {payments.length === 0 ? (
            <EmptyState
              title="No payments match"
              description="Payments will appear here once billing periods run, or clear your filters."
              className="py-12"
            />
          ) : (
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
                      <TableCellMoney>{formatMoneyGBP(p.amountPence)}</TableCellMoney>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[p.status] ?? "neutral"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-(--color-text-tertiary)">{p.createdAt.toISOString().slice(0, 10)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TablePanel>
      </div>
    </PageContent>
  );
}
