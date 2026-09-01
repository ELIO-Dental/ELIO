import { scopedDb } from "@elio/db";

export type DashboardStats = {
  activeMembers: number;
  monthlyRevenuePence: number;
  failedPaymentsThisMonth: number;
  newSignupsThisMonth: number;
};

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Legacy-parity dashboard metrics (P3.1). */
export async function getDashboardStats(practiceId: string): Promise<DashboardStats> {
  const db = scopedDb(practiceId);
  const startOfMonth = startOfCurrentMonth();

  const activeMemberWhere = {
    practiceId,
    status: "ACTIVE" as const,
    mandates: { some: { status: "ACTIVE" as const } },
  };

  const [activeMembers, activeEnrolments, failedPaymentsThisMonth, newSignupsThisMonth] = await Promise.all([
    db.planPatient.count({ where: activeMemberWhere }),
    db.patientPlanEnrolment.findMany({
      where: {
        practiceId,
        status: "ACTIVE",
        planPatient: activeMemberWhere,
      },
      include: { plan: { select: { monthlyPricePence: true } } },
    }),
    db.planPayment.count({
      where: { practiceId, status: "FAILED", createdAt: { gte: startOfMonth } },
    }),
    db.planPatient.count({
      where: {
        practiceId,
        status: "ACTIVE",
        OR: [
          { documentAcceptances: { some: { acceptedAt: { gte: startOfMonth } } } },
          {
            planModel: { monthlyPricePence: 0 },
            createdAt: { gte: startOfMonth },
          },
        ],
      },
    }),
  ]);

  const monthlyRevenuePence = activeEnrolments.reduce((sum, e) => sum + e.plan.monthlyPricePence, 0);

  return {
    activeMembers,
    monthlyRevenuePence,
    failedPaymentsThisMonth,
    newSignupsThisMonth,
  };
}
