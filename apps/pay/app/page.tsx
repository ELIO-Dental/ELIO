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
import { MoneyStatCard } from "@/components/money-stat-card";
import { WalletEmptyState } from "@/components/wallet-empty-state";
import { canPayViewAll, canPayViewAny, resolvePayPractitionerScope } from "@/lib/pay-scope";
import { filterPayslipsForScope } from "@/lib/pay-scope-utils";
import { parseUnmappedFromFetchResult } from "@/lib/unmapped-practitioners";
import { ACTIVE_DENTIST_WHERE } from "@/lib/active-dentists";

/** Step 37 — AuraPay-style home: periods, New Period, open period for Dentally→calc workflow. */
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
  const [periods, periodCount, dentistCount] = await Promise.all([
    db.payPeriod.findMany({
      orderBy: { periodStart: "desc" },
      take: 6,
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        dentallyFetchResultJson: true,
      },
    }),
    db.payPeriod.count(),
    db.dentist.count({ where: ACTIVE_DENTIST_WHERE }),
  ]);

  if (periods.length === 0) {
    return (
      <PageContent width="sm">
        <PageHeader title="Dashboard" description="Run payroll and pay periods." />
        <WalletEmptyState
          className="mt-8"
          title="No pay periods yet"
          description={
            dentistCount === 0
              ? "Add a dentist first, then create your first pay period."
              : "Create a pay period, then Fetch from Dentally and run calculation."
          }
        />
        {viewAll ? (
          <div className="mt-6 flex justify-center">
            <Link href="/pay-periods">
              <Button variant="primary">New pay period</Button>
            </Link>
          </div>
        ) : null}
      </PageContent>
    );
  }

  const currentPeriod = periods[0]!;
  const [rawEntries, needsReview, provisionalCount] = await Promise.all([
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
  const entries = filterPayslipsForScope(rawEntries, scope);
  const totalOwedPence = entries.reduce((sum, e) => sum + (e.finalPayPence ?? 0), 0);
  // Step 12/37 — unmapped live on fetch result JSON (ops review), not payslip discrepancies.
  const unmappedCount = viewAll
    ? parseUnmappedFromFetchResult(currentPeriod.dentallyFetchResultJson).length
    : 0;
  const periodLabel = `${currentPeriod.periodStart.toISOString().slice(0, 10)} – ${currentPeriod.periodEnd.toISOString().slice(0, 10)}`;

  return (
    <PageContent>
      <PageHeader
        title="Dashboard"
        description={
          <>
            Latest period: {periodLabel}{" "}
            <Badge variant={currentPeriod.status === "LOCKED" ? "success" : "warning"}>
              {currentPeriod.status}
            </Badge>
          </>
        }
        actions={
          viewAll ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/pay-periods">
                <Button variant="secondary">New period</Button>
              </Link>
              <Link href={`/pay-periods/${currentPeriod.id}`}>
                <Button variant="primary">Open period</Button>
              </Link>
            </div>
          ) : (
            <Link href={`/pay-periods/${currentPeriod.id}`}>
              <Button variant="primary">View my payslip</Button>
            </Link>
          )
        }
      />

      <div className="mt-8 flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyStatCard
            label={viewAll ? "Total owed this period" : "My payment this period"}
            valuePence={totalOwedPence}
          />
          {viewAll ? <StatCard label="Payslips this period" value={entries.length} /> : null}
          {viewAll ? <StatCard label="Pay periods" value={periodCount} /> : null}
          {viewAll ? <StatCard label="Active dentists" value={dentistCount} /> : null}
        </div>

        {viewAll && provisionalCount > 0 ? (
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

        {viewAll && unmappedCount > 0 ? (
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

        {viewAll && needsReview > 0 ? (
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
            <CardHeader>
              <CardTitle>Recent pay periods</CardTitle>
            </CardHeader>
            <CardContent>
              <StaggerList className="divide-y divide-(--color-border-subtle)">
                {periods.map((p) => (
                  <StaggerItem key={p.id} className="flex items-center justify-between py-3">
                    <Link
                      href={`/pay-periods/${p.id}`}
                      className="text-body-sm text-(--color-primary-500) hover:underline"
                    >
                      {p.periodStart.toISOString().slice(0, 10)} – {p.periodEnd.toISOString().slice(0, 10)}
                    </Link>
                    <Badge variant={p.status === "LOCKED" ? "success" : "neutral"}>{p.status}</Badge>
                  </StaggerItem>
                ))}
              </StaggerList>
              <p className="mt-3 text-caption text-(--color-text-tertiary)">
                Workflow: open period → Fetch from Dentally → ops fields → Run calculation → Finalize.
              </p>
            </CardContent>
          </Card>
        ) : null}

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
      </div>
    </PageContent>
  );
}
