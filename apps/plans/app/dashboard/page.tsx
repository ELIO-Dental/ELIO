import Link from "next/link";
import { can, requireLicensedSession } from "@/lib/session";
import type { Role } from "@elio/db";
import { prisma } from "@elio/db";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
  PageContent,
  PageHeader,
  formatMoneyGBP,
} from "@elio/ui";
import { PlansStatCard } from "@/components/plans-stat-card";
import { getDashboardRecentActivity, getDashboardStats } from "@/lib/dashboard-stats";
import { DashboardActivityFeed } from "./dashboard-activity-feed";
import { DashboardQuickActions } from "./dashboard-quick-actions";
import { PaymentScheduleCard } from "./payment-schedule-card";

function currentBillingPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const session = await requireLicensedSession();
  const role = session.role as Role;
  const canViewRevenue = can({ role }, "plans:view-payments");

  const practiceId = session.practiceId;
  const period = currentBillingPeriod();

  const [stats, recentActivity, recentPayments] = await Promise.all([
    getDashboardStats(practiceId),
    getDashboardRecentActivity(practiceId),
    prisma.planPayment.findMany({
      where: { practiceId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { planPatient: { include: { patient: true } } },
    }),
  ]);

  const statusVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
    PENDING: "warning",
    CONFIRMED: "success",
    PAID_OUT: "success",
    FAILED: "danger",
    CANCELLED: "neutral",
    CHARGED_BACK: "danger",
  };

  return (
    <PageContent width="full">
      <PageHeader
        title="Dashboard"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Membership plans overview
            <Badge variant="neutral">Period {period}</Badge>
          </span>
        }
        actions={
          <Link href="/patients">
            <Button variant="primary">Add a new patient</Button>
          </Link>
        }
      />

      <div className="mt-6 flex flex-col gap-6 sm:mt-8 sm:gap-8">
        <div
          className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${canViewRevenue ? "md:grid-cols-4" : "md:grid-cols-3"}`}
          data-testid="plans-stat-cards"
        >
          <PlansStatCard label="Active members" value={stats.activeMembers} tone="accent" />
          {canViewRevenue ? (
            <PlansStatCard label="Monthly revenue" value={stats.monthlyRevenuePence} money tone="success" />
          ) : null}
          <PlansStatCard
            label="Failed payments"
            value={stats.failedPaymentsThisMonth}
            tone={stats.failedPaymentsThisMonth > 0 ? "danger" : "default"}
          />
          <PlansStatCard label="New signups" value={stats.newSignupsThisMonth} tone="success" />
        </div>

        {stats.failedPaymentsThisMonth > 0 ? (
          <div className="flex flex-col gap-3 rounded-(--radius-xl) border border-(--color-danger)/25 bg-(--color-surface) px-4 py-3.5 shadow-(--shadow-xs) sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <p className="text-body font-medium text-(--color-text-primary)">
                {stats.failedPaymentsThisMonth} payment(s) failed this month
              </p>
              <p className="mt-0.5 text-body-sm text-(--color-text-secondary)">
                Review patients and check their mandate status.
              </p>
            </div>
            <Link href="/payments?status=FAILED">
              <Button variant="secondary">Review failed payments</Button>
            </Link>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
          <DashboardQuickActions />
          <DashboardActivityFeed entries={recentActivity} />
        </div>

        <section className="overflow-hidden rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) shadow-(--shadow-xs)">
          <header className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/40 px-4 py-3.5 sm:px-5">
            <h2 className="text-body-sm font-semibold text-(--color-text-primary)">Recent payments</h2>
          </header>
          <div className="px-4 py-2 sm:px-5">
            {recentPayments.length === 0 ? (
              <p className="py-6 text-body-sm text-(--color-text-secondary)">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-(--color-border-subtle)">
                {recentPayments.map((p) => {
                  const name =
                    [p.planPatient.patient.firstName, p.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <span className="block truncate text-body-sm font-medium text-(--color-text-primary)">{name}</span>
                        {p.billingPeriod ? (
                          <span className="text-caption text-(--color-text-tertiary)">{p.billingPeriod}</span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge variant={statusVariant[p.status] ?? "neutral"}>{p.status}</Badge>
                        <span className="font-(--font-mono) text-body-sm tabular-nums text-(--color-text-primary)">
                          {formatMoneyGBP(p.amountPence)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <PaymentScheduleCard />
      </div>
    </PageContent>
  );
}
