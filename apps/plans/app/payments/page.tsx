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
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { PaymentsFilterBar } from "./payments-filter-bar";
import { PaymentNotifyButton } from "./payment-notify-button";
import { PlansMetricTile } from "@/components/plans-page-chrome";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  PENDING: "warning",
  CONFIRMED: "success",
  PAID_OUT: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  CHARGED_BACK: "danger",
};

const PENDING_STATUSES = ["PENDING", "CONFIRMED"] as const;

export const dynamic = "force-dynamic";

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

  const [payments, totalCount, paidCount, pendingCount, failedCount] = await Promise.all([
    prisma.planPayment.findMany({
      where,
      include: { planPatient: { include: { patient: true } }, mandate: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.planPayment.count({ where }),
    prisma.planPayment.count({ where: { practiceId, status: "PAID_OUT" } }),
    prisma.planPayment.count({ where: { practiceId, status: { in: [...PENDING_STATUSES] } } }),
    prisma.planPayment.count({ where: { practiceId, status: "FAILED" } }),
  ]);

  return (
    <PageContent width="full">
      <PageHeader title="Payments" description="Track Direct Debit payments and statuses." />

      <div className="mt-6 grid gap-2.5 sm:grid-cols-3 sm:gap-3">
        <PlansMetricTile
          label="Paid out"
          value={paidCount}
          tone="success"
          icon={<CheckCircle className="size-5" aria-hidden />}
        />
        <PlansMetricTile
          label="Pending"
          value={pendingCount}
          tone="warning"
          icon={<Clock className="size-5" aria-hidden />}
        />
        <PlansMetricTile
          label="Failed"
          value={failedCount}
          tone="danger"
          icon={<AlertCircle className="size-5" aria-hidden />}
        />
      </div>

      <div className="mt-6 sm:mt-8">
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
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Charge Period</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const name =
                    [p.planPatient.patient.firstName, p.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  const email = p.planPatient.patient.email;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-medium text-(--color-text-primary)">{name}</p>
                        {email ? <p className="text-caption text-(--color-text-tertiary)">{email}</p> : null}
                        {p.mandate?.status ? (
                          <p className="text-caption text-(--color-text-tertiary)">Mandate · {p.mandate.status}</p>
                        ) : null}
                      </TableCell>
                      <TableCellMoney>{formatMoneyGBP(p.amountPence)}</TableCellMoney>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[p.status] ?? "neutral"}>{p.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell>{p.billingPeriod ?? "—"}</TableCell>
                      <TableCell className="text-(--color-text-tertiary)">
                        {p.createdAt.toLocaleDateString("en-GB")}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.status === "FAILED" ? (
                          <PaymentNotifyButton paymentId={p.id} patientEmail={email} />
                        ) : (
                          <span className="text-caption text-(--color-text-tertiary)">—</span>
                        )}
                      </TableCell>
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
