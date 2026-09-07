import Link from "next/link";
import { redirectToLogin, redirectToLauncher } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb, type Role } from "@elio/db";
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
  TableToolbar,
  TablePagination,
  parseTablePage,
} from "@elio/ui";
import { canPayViewAll, canPayViewAny } from "@/lib/pay-scope";
import { NewPayPeriodForm } from "./new-pay-period-form";
import { formatPayPeriodMonthLabel, formatPayPeriodStatusLabel } from "@/lib/pay-dashboard-labels";

export default async function PayPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.practiceId || !session.userId) return redirectToLogin();
  const subject = { role: session.role as Role, userId: session.userId };
  if (!canPayViewAny(subject)) {
    return redirectToLauncher("error=forbidden");
  }
  const viewAll = canPayViewAll(subject);
  const { page, skip, pageSize } = parseTablePage(await searchParams);

  const db = scopedDb(session.practiceId);
  const [payPeriods, totalCount] = await Promise.all([
    db.payPeriod.findMany({
      orderBy: { periodStart: "desc" },
      include: { _count: { select: { payslipEntries: true, compassStatements: true } } },
      skip,
      take: pageSize,
    }),
    db.payPeriod.count(),
  ]);

  return (
    <PageContent>
      <PageHeader
        title="Pay periods"
        description={viewAll ? "Create and manage monthly payroll runs." : "Open a period to view your payslip."}
      />

      {viewAll ? (
        <div className="mt-8">
          <NewPayPeriodForm />
        </div>
      ) : null}

      <div className="mt-8">
        {totalCount === 0 ? (
          <TablePanel toolbar={<TableToolbar title="Pay periods" />}>
            <EmptyState title="No pay periods yet" description="Start one above (§6.0 — the exact previous calendar month)." className="py-12" />
          </TablePanel>
        ) : (
          <TablePanel
            toolbar={<TableToolbar title="Pay periods" />}
            footer={<TablePagination page={page} pageSize={pageSize} totalCount={totalCount} />}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Compass statements</TableHead>
                  <TableHead>Payslips</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payPeriods.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/pay-periods/${p.id}`} className="text-(--color-primary-500) hover:underline">
                        {formatPayPeriodMonthLabel(p.periodStart)}
                      </Link>
                      <p className="text-caption text-(--color-text-tertiary)">
                        {p.periodStart.toISOString().slice(0, 10)} – {p.periodEnd.toISOString().slice(0, 10)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "LOCKED" ? "success" : "neutral"}>
                        {formatPayPeriodStatusLabel(p.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{p._count.compassStatements}</TableCell>
                    <TableCell>{p._count.payslipEntries}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TablePanel>
        )}
      </div>
    </PageContent>
  );
}
