import Link from "next/link";
import { redirectToLogin, redirectToLauncher } from "@/lib/session";
import { scopedDb, type Role } from "@elio/db";
import { auth } from "@elio/auth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  StaggerList,
  StaggerItem,
  PageContent,
  PageHeader,
} from "@elio/ui";
import { FileWarning, Calendar, Plus, Users, FileText, TrendingUp } from "lucide-react";
import { canPayViewAll, canPayViewAny, resolvePayPractitionerScope } from "@/lib/pay-scope";
import { parseUnmappedFromFetchResult } from "@/lib/unmapped-practitioners";
import { ACTIVE_DENTIST_WHERE } from "@/lib/active-dentists";
import {
  formatPayPeriodMonthLabel,
  formatPayPeriodMonthShort,
  formatPayPeriodStatusLabel,
  uniqueRecentPeriodsByMonth,
} from "@/lib/pay-dashboard-labels";

/**
 * AuraPay home parity (`/dashboard`) inside ELIO design.
 * Stats + Recent Pay Periods only — payslips open via Pay Periods (old Payslips tab).
 */
export default async function PayDashboardPage() {
  const session = await auth();
  if (!session?.practiceId || !session.userId) return redirectToLogin();
  const subject = { role: session.role as Role, userId: session.userId };
  if (!canPayViewAny(subject)) {
    return redirectToLauncher("error=forbidden");
  }

  const db = scopedDb(session.practiceId);
  const scope = await resolvePayPractitionerScope(session.practiceId, subject);
  if (!scope.viewAll && !scope.dentistId) {
    return redirectToLauncher("error=forbidden");
  }
  const viewAll = canPayViewAll(subject);
  const [rawPeriods, dentistCount] = await Promise.all([
    db.payPeriod.findMany({
      orderBy: [{ periodStart: "desc" }, { createdAt: "asc" }],
      take: 60,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        createdAt: true,
        dentallyFetchResultJson: true,
        _count: { select: { payslipEntries: true } },
      },
    }),
    db.dentist.count({ where: ACTIVE_DENTIST_WHERE }),
  ]);

  const periodsWithCounts = rawPeriods.map((p) => ({
    ...p,
    payslipCount: p._count.payslipEntries,
  }));
  const periodCount = uniqueRecentPeriodsByMonth(periodsWithCounts, Number.MAX_SAFE_INTEGER).length;
  const periods = uniqueRecentPeriodsByMonth(periodsWithCounts, 5);
  const currentPeriod = periods[0] ?? null;
  const latestPeriodLabel = currentPeriod
    ? formatPayPeriodMonthLabel(currentPeriod.periodStart)
    : "None";

  let needsReview = 0;
  let provisionalCount = 0;
  if (currentPeriod && viewAll) {
    [needsReview, provisionalCount] = await Promise.all([
      db.payLine.count({
        where: {
          compassStatement: { payPeriodId: currentPeriod.id },
          matchConfidence: "NEEDS_REVIEW",
        },
      }),
      db.payslipEntry.count({
        where: { payPeriodId: currentPeriod.id, provisional: true },
      }),
    ]);
  }

  const unmappedCount =
    viewAll && currentPeriod
      ? parseUnmappedFromFetchResult(currentPeriod.dentallyFetchResultJson).length
      : 0;

  return (
    <PageContent>
      <PageHeader
        title="Dashboard"
        description="Manage payslips and dentist payments"
        actions={
          viewAll ? (
            <Link href="/pay-periods/new">
              <Button variant="primary">
                <Plus className="size-4" aria-hidden />
                New Period
              </Button>
            </Link>
          ) : currentPeriod ? (
            <Link href={`/pay-periods/${currentPeriod.id}`}>
              <Button variant="primary">View my payslip</Button>
            </Link>
          ) : null
        }
      />

      <div className="mt-8 flex flex-col gap-6">
        {/* AuraPay-style stats: value + label, compact (not hero money type). */}
        {viewAll ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="flex items-center gap-3 px-5 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-600)">
                <Users className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-(--color-text-primary)">{dentistCount}</p>
                <p className="text-caption text-(--color-text-secondary)">Active Dentists</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 px-5 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-success)/10 text-(--color-success)">
                <FileText className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-(--color-text-primary)">{periodCount}</p>
                <p className="text-caption text-(--color-text-secondary)">Pay Periods</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 px-5 py-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-warning)/10 text-(--color-warning)">
                <TrendingUp className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xl font-bold text-(--color-text-primary)">{latestPeriodLabel}</p>
                <p className="text-caption text-(--color-text-secondary)">Latest Period</p>
              </div>
            </Card>
          </div>
        ) : null}

        {viewAll && provisionalCount > 0 && currentPeriod ? (
          <Card className="flex items-center justify-between" accentColor="var(--color-warning)">
            <div className="flex items-center gap-3">
              <FileWarning className="size-5 text-(--color-warning)" />
              <div>
                <p className="text-body font-medium text-(--color-text-primary)">
                  {provisionalCount} provisional payslip(s)
                </p>
                <p className="text-body-sm text-(--color-text-secondary)">
                  Confirm finance term/fee, then recalculate before finalize.
                </p>
              </div>
            </div>
            <Link href={`/pay-periods/${currentPeriod.id}`}>
              <Button variant="secondary">Open period</Button>
            </Link>
          </Card>
        ) : null}

        {viewAll && unmappedCount > 0 && currentPeriod ? (
          <Card className="flex items-center justify-between" accentColor="var(--color-warning)">
            <div className="flex items-center gap-3">
              <FileWarning className="size-5 text-(--color-warning)" />
              <div>
                <p className="text-body font-medium text-(--color-text-primary)">
                  {unmappedCount} unmapped practitioner flag(s)
                </p>
                <p className="text-body-sm text-(--color-text-secondary)">
                  Map Dentally user.id on Dentists, then re-fetch before calculation.
                </p>
              </div>
            </div>
            <Link href={`/pay-periods/${currentPeriod.id}`}>
              <Button variant="secondary">Open ops review</Button>
            </Link>
          </Card>
        ) : null}

        {viewAll && needsReview > 0 && currentPeriod ? (
          <Card className="flex items-center justify-between" accentColor="var(--color-warning)">
            <div className="flex items-center gap-3">
              <FileWarning className="size-5 text-(--color-warning)" />
              <div>
                <p className="text-body font-medium text-(--color-text-primary)">
                  {needsReview} Compass line(s) need manual review
                </p>
                <p className="text-body-sm text-(--color-text-secondary)">
                  Unmatched performer numbers or a name mismatch since the last statement.
                </p>
              </div>
            </div>
            <Link href={`/pay-periods/${currentPeriod.id}`}>
              <Button variant="secondary">Review now</Button>
            </Link>
          </Card>
        ) : null}

        {viewAll ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle>Recent Pay Periods</CardTitle>
              <Link
                href="/pay-periods"
                className="text-body-sm font-medium text-(--color-primary-500) hover:underline"
              >
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {periods.length === 0 ? (
                <div className="py-10 text-center">
                  <Calendar className="mx-auto mb-3 size-10 text-(--color-text-tertiary)" aria-hidden />
                  <p className="text-body-sm text-(--color-text-secondary)">No pay periods yet.</p>
                  <Link
                    href="/pay-periods/new"
                    className="mt-3 inline-flex items-center gap-1.5 text-body-sm font-medium text-(--color-primary-500) hover:underline"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Create your first pay period
                  </Link>
                  {dentistCount === 0 ? (
                    <p className="mt-2 text-caption text-(--color-text-tertiary)">
                      Tip: add a dentist first, then create the period.
                    </p>
                  ) : null}
                </div>
              ) : (
                <StaggerList className="divide-y divide-(--color-border-subtle)">
                  {periods.map((p) => {
                    const statusLabel = formatPayPeriodStatusLabel(p.status);
                    return (
                      <StaggerItem key={p.id}>
                        <Link
                          href={`/pay-periods/${p.id}`}
                          className="flex items-center justify-between gap-3 py-3.5 hover:bg-(--color-bg-subtle)/60 -mx-1 px-1 rounded-(--radius-sm)"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-caption font-bold text-(--color-primary-600)">
                              {formatPayPeriodMonthShort(p.periodStart)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-body-sm font-medium text-(--color-text-primary)">
                                {formatPayPeriodMonthLabel(p.periodStart)}
                              </p>
                              <p className="text-caption text-(--color-text-tertiary)">
                                Created {p.createdAt.toLocaleDateString("en-GB")}
                              </p>
                            </div>
                          </div>
                          <Badge variant={p.status === "LOCKED" ? "success" : "warning"}>
                            {statusLabel}
                          </Badge>
                        </Link>
                      </StaggerItem>
                    );
                  })}
                </StaggerList>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8 text-center">
              {currentPeriod ? (
                <p className="text-body-sm text-(--color-text-secondary)">
                  Open <strong className="text-(--color-text-primary)">Pay Periods</strong> or use{" "}
                  <strong className="text-(--color-text-primary)">View my payslip</strong> above for{" "}
                  {formatPayPeriodMonthLabel(currentPeriod.periodStart)}.
                </p>
              ) : (
                <p className="text-body-sm text-(--color-text-secondary)">
                  No pay periods yet. Ask ops to create one.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageContent>
  );
}
