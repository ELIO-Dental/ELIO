import Link from "next/link";
import { redirectToLogin, redirectToLauncher } from "@/lib/session";
import { scopedDb, type Role } from "@elio/db";
import { auth } from "@elio/auth";
import {
  StatCard,
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
  formatMoneyGBPOrDash,
} from "@elio/ui";
import { FileWarning } from "lucide-react";
import { canPayViewAll, canPayViewAny, resolvePayPractitionerScope } from "@/lib/pay-scope";
import { filterPayslipsForScope } from "@/lib/pay-scope-utils";
import { parseUnmappedFromFetchResult } from "@/lib/unmapped-practitioners";
import { ACTIVE_DENTIST_WHERE } from "@/lib/active-dentists";
import {
  formatPayPeriodMonthLabel,
  formatPayPeriodMonthShort,
  formatPayPeriodStatusLabel,
  uniqueRecentPeriodsByMonth,
} from "@/lib/pay-dashboard-labels";

/**
 * Step 37 — AuraPay home parity (`/dashboard`) inside ELIO design.
 * Stats: Active Dentists, Pay Periods, Latest Period (no “total owed” money card — client request).
 * Recent Pay Periods: one row per calendar month (AuraPay unique month/year), labels from month/year ints.
 * Created date uses PayPeriod.createdAt (backfilled from AuraPay created_at when migrated).
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
      take: 60, // then unique-by-month to 5 (prefer most payslips / LOCKED / original createdAt)
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
  // AuraPay counted unique month/year periods — not accidental duplicate rows.
  const periodCount = uniqueRecentPeriodsByMonth(periodsWithCounts, Number.MAX_SAFE_INTEGER).length;
  const periods = uniqueRecentPeriodsByMonth(periodsWithCounts, 5);
  const currentPeriod = periods[0] ?? null;
  const latestPeriodLabel = currentPeriod
    ? formatPayPeriodMonthLabel(currentPeriod.periodStart)
    : "None";

  let rawEntries: Awaited<
    ReturnType<
      typeof db.payslipEntry.findMany<{ include: { dentist: true } }>
    >
  > = [];
  let needsReview = 0;
  let provisionalCount = 0;
  if (currentPeriod) {
    [rawEntries, needsReview, provisionalCount] = await Promise.all([
      db.payslipEntry.findMany({
        where: {
          payPeriodId: currentPeriod.id,
          ...(scope.dentistId && !scope.viewAll ? { dentistId: scope.dentistId } : {}),
        },
        include: { dentist: true },
      }),
      viewAll
        ? db.payLine.count({
            where: {
              compassStatement: { payPeriodId: currentPeriod.id },
              matchConfidence: "NEEDS_REVIEW",
            },
          })
        : Promise.resolve(0),
      viewAll
        ? db.payslipEntry.count({
            where: { payPeriodId: currentPeriod.id, provisional: true },
          })
        : Promise.resolve(0),
    ]);
  }

  const entries = filterPayslipsForScope(rawEntries, scope);
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
            <div className="flex flex-wrap gap-2">
              <Link href="/pay-periods">
                <Button variant="primary">New Period</Button>
              </Link>
              {currentPeriod ? (
                <Link href={`/pay-periods/${currentPeriod.id}`}>
                  <Button variant="secondary">Open period</Button>
                </Link>
              ) : null}
            </div>
          ) : currentPeriod ? (
            <Link href={`/pay-periods/${currentPeriod.id}`}>
              <Button variant="primary">View my payslip</Button>
            </Link>
          ) : null
        }
      />

      <div className="mt-8 flex flex-col gap-8">
        {/* AuraPay home stats — three cards only (no owed/price card). */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {viewAll ? <StatCard label="Active Dentists" value={dentistCount} /> : null}
          {viewAll ? <StatCard label="Pay Periods" value={periodCount} /> : null}
          {viewAll ? (
            <Card className="flex flex-col justify-center px-5 py-4">
              <p className="text-h3 font-bold text-(--color-text-primary)">{latestPeriodLabel}</p>
              <p className="mt-0.5 text-caption text-(--color-text-secondary)">Latest Period</p>
            </Card>
          ) : null}
        </div>

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
                <div className="py-8 text-center">
                  <p className="text-body-sm text-(--color-text-secondary)">No pay periods yet.</p>
                  <Link
                    href="/pay-periods"
                    className="mt-3 inline-block text-body-sm font-medium text-(--color-primary-500) hover:underline"
                  >
                    Create your first pay period
                  </Link>
                  {dentistCount === 0 ? (
                    <p className="mt-2 text-caption text-(--color-text-tertiary)">
                      Tip: add a dentist first, then create the period.
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <StaggerList className="divide-y divide-(--color-border-subtle)">
                    {periods.map((p) => {
                      const statusLabel = formatPayPeriodStatusLabel(p.status);
                      return (
                        <StaggerItem key={p.id}>
                          <Link
                            href={`/pay-periods/${p.id}`}
                            className="flex items-center justify-between gap-3 py-3 hover:bg-(--color-bg-subtle)/60 -mx-1 px-1 rounded-(--radius-sm)"
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
                                  Created{" "}
                                  {p.createdAt.toLocaleDateString("en-GB")}
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
                  <p className="mt-3 text-caption text-(--color-text-tertiary)">
                    Workflow: open period → Fetch from Dentally → ops fields → Run calculation → Finalize.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {currentPeriod ? (
          <Card>
            <CardHeader>
              <CardTitle>{viewAll ? "This period's payslips" : "My payslip"}</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="text-body-sm text-(--color-text-secondary)">
                  {viewAll
                    ? "No payslips calculated yet — fetch Dentally data, complete ops fields, then run calculation."
                    : "No payslip for you in this period yet."}
                </p>
              ) : (
                <StaggerList className="divide-y divide-(--color-border-subtle)">
                  {entries.map((e) => (
                    <StaggerItem key={e.id} className="flex items-center justify-between py-3">
                      <span className="text-body-sm text-(--color-text-primary)">
                        {e.dentist.name}
                        {e.provisional ? (
                          <Badge variant="warning" className="ml-2">
                            Provisional
                          </Badge>
                        ) : null}
                      </span>
                      <span className="font-(--font-mono) text-body-sm tabular-nums text-(--color-text-primary)">
                        {formatMoneyGBPOrDash(e.finalPayPence)}
                      </span>
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </CardContent>
          </Card>
        ) : !viewAll ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-body-sm text-(--color-text-secondary)">
                No pay periods yet. Ask ops to create one.
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageContent>
  );
}
