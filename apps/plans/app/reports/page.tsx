import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import { Card, CardHeader, CardTitle, CardContent, StatCard, PageContent, PageHeader } from "@elio/ui";
import { MoneyStatCard } from "@/components/money-stat-card";

function currentBillingPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

export default async function ReportsPage() {
  const session = await requireLicensedSession();
  const practiceId = session.practiceId;
  const period = currentBillingPeriod();

  const [activeEnrolments, activePatients, cancelledPatients, allPatients, paymentsThisPeriod, paymentCounts] =
    await Promise.all([
      prisma.patientPlanEnrolment.findMany({
        where: { practiceId, status: "ACTIVE" },
        include: { plan: { select: { monthlyPricePence: true, name: true } } },
      }),
      prisma.planPatient.count({ where: { practiceId, status: "ACTIVE" } }),
      prisma.planPatient.count({ where: { practiceId, status: "CANCELLED" } }),
      prisma.planPatient.count({ where: { practiceId } }),
      prisma.planPayment.aggregate({
        where: { practiceId, billingPeriod: period },
        _sum: { amountPence: true },
        _count: true,
      }),
      prisma.planPayment.groupBy({
        by: ["status"],
        where: { practiceId, billingPeriod: period },
        _count: true,
      }),
    ]);

  const mrrPence = activeEnrolments.reduce((sum, e) => sum + e.plan.monthlyPricePence, 0);
  const churnRate = allPatients > 0 ? (cancelledPatients / allPatients) * 100 : 0;

  const totalPaymentsThisPeriod = paymentCounts.reduce((sum, g) => sum + g._count, 0);
  const successfulPaymentsThisPeriod = paymentCounts
    .filter((g) => g.status === "CONFIRMED" || g.status === "PAID_OUT")
    .reduce((sum, g) => sum + g._count, 0);
  const successRate = totalPaymentsThisPeriod > 0 ? (successfulPaymentsThisPeriod / totalPaymentsThisPeriod) * 100 : 0;

  // Revenue by plan, derived from active enrolments (no new business logic —
  // just grouping the same rows already fetched for MRR).
  const revenueByPlan = new Map<string, { count: number; pence: number }>();
  for (const e of activeEnrolments) {
    const entry = revenueByPlan.get(e.plan.name) ?? { count: 0, pence: 0 };
    entry.count += 1;
    entry.pence += e.plan.monthlyPricePence;
    revenueByPlan.set(e.plan.name, entry);
  }

  return (
    <PageContent>
      <PageHeader
        title="Reports"
        description={
          <>
            Summary of plan performance for billing period <strong>{period}</strong>.
          </>
        }
      />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active plans" value={activePatients} />
          <MoneyStatCard label="Monthly recurring revenue" value={mrrPence} />
          <StatCard label="Churn / cancellations" value={cancelledPatients} />
          <StatCard label="Payment success rate this period (%)" value={Math.round(successRate * 10) / 10} />
        </div>

        <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <p className="text-caption text-(--color-text-tertiary) sm:col-start-3">
            {churnRate.toFixed(1)}% of all plan patients ({cancelledPatients} of {allPatients})
          </p>
          <p className="text-caption text-(--color-text-tertiary)">
            {successfulPaymentsThisPeriod} of {totalPaymentsThisPeriod} payments succeeded ({pct(successRate)})
          </p>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Revenue by plan (active enrolments)</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueByPlan.size === 0 ? (
              <p className="text-body-sm text-(--color-text-secondary)">No active plan enrolments yet.</p>
            ) : (
              <ul className="divide-y divide-(--color-border-subtle)">
                {Array.from(revenueByPlan.entries()).map(([name, entry]) => (
                  <li key={name} className="flex items-center justify-between py-3">
                    <div>
                      <span className="text-body-sm text-(--color-text-primary)">{name}</span>
                      <span className="ml-2 text-body-sm text-(--color-text-tertiary)">{entry.count} patients</span>
                    </div>
                    <span className="tabular-nums font-(--font-mono) text-body-sm text-(--color-text-primary)">
                      £{(entry.pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Payments this period, by status</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentCounts.length === 0 ? (
              <p className="text-body-sm text-(--color-text-secondary)">No payments recorded for {period} yet.</p>
            ) : (
              <ul className="divide-y divide-(--color-border-subtle)">
                {paymentCounts.map((g) => (
                  <li key={g.status} className="flex items-center justify-between py-3">
                    <span className="text-body-sm text-(--color-text-primary)">{g.status}</span>
                    <span className="tabular-nums font-(--font-mono) text-body-sm text-(--color-text-secondary)">
                      {g._count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-caption text-(--color-text-tertiary)">
              Collected so far this period:{" "}
              £{((paymentsThisPeriod._sum.amountPence ?? 0) / 100).toLocaleString("en-GB", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
    </PageContent>
  );
}
