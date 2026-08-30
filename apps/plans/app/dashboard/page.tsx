import Link from "next/link";
import { requireLicensedSession } from "@/lib/session";
import { prisma } from "@elio/db";
import {
  StatCard,
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
import { MoneyStatCard } from "@/components/money-stat-card";

function currentBillingPeriod() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function DashboardPage() {
  const session = await requireLicensedSession();

  const practiceId = session.practiceId;
  const period = currentBillingPeriod();

  const [activePatients, activePlanEnrolments, paymentsThisPeriod, overdueOrFailed, recentPayments] =
    await Promise.all([
      prisma.planPatient.count({ where: { practiceId, status: "ACTIVE" } }),
      prisma.patientPlanEnrolment.findMany({
        where: { practiceId, status: "ACTIVE" },
        include: { plan: { select: { monthlyPricePence: true } } },
      }),
      prisma.planPayment.aggregate({
        where: { practiceId, billingPeriod: period },
        _sum: { amountPence: true },
        _count: true,
      }),
      prisma.planPayment.count({
        where: { practiceId, status: { in: ["FAILED", "CHARGED_BACK"] } },
      }),
      prisma.planPayment.findMany({
        where: { practiceId },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { planPatient: { include: { patient: true } } },
      }),
    ]);

  const mrrPence = activePlanEnrolments.reduce((sum, e) => sum + e.plan.monthlyPricePence, 0);
  const collectedThisPeriodPence = paymentsThisPeriod._sum.amountPence ?? 0;

  const statusVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
    PENDING: "warning",
    CONFIRMED: "success",
    PAID_OUT: "success",
    FAILED: "danger",
    CANCELLED: "neutral",
    CHARGED_BACK: "danger",
  };

  return (
    <PageContent>
      <PageHeader
        title="Dashboard"
        description={
          <>
            Membership plans, billing period <Badge variant="neutral">{period}</Badge>
          </>
        }
        actions={
          <Link href="/patients">
            <Button variant="primary">Enrol a patient</Button>
          </Link>
        }
      />

      <div className="mt-8 flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active plan patients" value={activePatients} />
          <MoneyStatCard label="Monthly recurring revenue" value={mrrPence} />
          <MoneyStatCard label="Collected this period" value={collectedThisPeriodPence} />
          <StatCard label="Overdue / failed payments" value={overdueOrFailed} />
        </div>

        {overdueOrFailed > 0 && (
          <Card className="flex items-center justify-between" accentColor="var(--color-danger)">
            <div>
              <p className="text-body font-medium text-(--color-text-primary)">
                {overdueOrFailed} payment(s) failed or charged back
              </p>
              <p className="text-body-sm text-(--color-text-secondary)">
                Review patients below and check their mandate status.
              </p>
            </div>
            <Link href="/patients">
              <Button variant="secondary">Review patients</Button>
            </Link>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPayments.length === 0 ? (
              <p className="text-body-sm text-(--color-text-secondary)">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-(--color-border-subtle)">
                {recentPayments.map((p) => {
                  const name =
                    [p.planPatient.patient.firstName, p.planPatient.patient.lastName].filter(Boolean).join(" ") ||
                    "Unknown patient";
                  return (
                    <li key={p.id} className="flex items-center justify-between py-3">
                      <div>
                        <span className="text-body-sm text-(--color-text-primary)">{name}</span>
                        {p.billingPeriod && (
                          <span className="ml-2 text-body-sm text-(--color-text-tertiary)">{p.billingPeriod}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
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
          </CardContent>
        </Card>
      </div>
    </PageContent>
  );
}
