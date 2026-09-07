import Link from "next/link";
import { redirectToLogin, redirectToLauncher } from "@/lib/session";
import { auth } from "@elio/auth";
import { scopedDb, type Role } from "@elio/db";
import { Badge, Button, PageContent } from "@elio/ui";
import { Calendar, ChevronRight, Plus } from "lucide-react";
import { canPayViewAll, canPayViewAny } from "@/lib/pay-scope";
import {
  formatPayPeriodMonthLabel,
  formatPayPeriodMonthShort,
  formatPayPeriodStatusLabel,
  uniqueRecentPeriodsByMonth,
} from "@/lib/pay-dashboard-labels";

export default async function PayPeriodsPage() {
  const session = await auth();
  if (!session?.practiceId || !session.userId) return redirectToLogin();
  const subject = { role: session.role as Role, userId: session.userId };
  if (!canPayViewAny(subject)) {
    return redirectToLauncher("error=forbidden");
  }
  const viewAll = canPayViewAll(subject);

  const db = scopedDb(session.practiceId);
  const rawPeriods = await db.payPeriod.findMany({
    orderBy: { periodStart: "desc" },
    include: { _count: { select: { payslipEntries: true } } },
  });

  const periods = uniqueRecentPeriodsByMonth(
    rawPeriods.map((p) => ({
      ...p,
      payslipCount: p._count.payslipEntries,
    })),
    rawPeriods.length || 1
  );

  return (
    <PageContent>
      <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-h2 text-(--color-text-primary)">Pay Periods</h1>
            <p className="mt-0.5 text-body-sm text-(--color-text-secondary)">
              {viewAll ? "All monthly payslip periods" : "Open a period to view your payslip"}
            </p>
          </div>
          {viewAll ? (
            <Button asChild className="w-full sm:w-auto">
              <Link href="/pay-periods/new">
                <Plus className="mr-1.5 h-4 w-4" />
                New Period
              </Link>
            </Button>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-xl border border-(--color-border-subtle) bg-(--color-surface)">
          {periods.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="mx-auto mb-3 h-11 w-11 text-(--color-text-tertiary)" />
              <p className="text-(--color-text-secondary)">No pay periods created yet.</p>
              {viewAll ? (
                <Button asChild className="mt-4" variant="outline">
                  <Link href="/pay-periods/new">New Period</Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-(--color-border-subtle)">
              {periods.map((p) => {
                const statusLabel = formatPayPeriodStatusLabel(p.status);
                return (
                  <Link
                    key={p.id}
                    href={`/pay-periods/${p.id}`}
                    className="group flex items-center justify-between px-5 py-4 transition hover:bg-(--color-bg-subtle)"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-(--color-primary-50) text-sm font-bold text-(--color-primary-600)">
                        {formatPayPeriodMonthShort(p.periodStart)}
                      </div>
                      <div>
                        <p className="font-semibold text-(--color-text-primary)">
                          {formatPayPeriodMonthLabel(p.periodStart)}
                        </p>
                        <p className="mt-0.5 text-xs text-(--color-text-tertiary)">
                          Created {p.createdAt.toLocaleDateString("en-GB")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={p.status === "LOCKED" ? "success" : "warning"}>
                        {statusLabel}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-(--color-text-tertiary) transition group-hover:text-(--color-brand)" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageContent>
  );
}
