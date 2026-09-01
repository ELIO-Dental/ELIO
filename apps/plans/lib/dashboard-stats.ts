import { scopedDb } from "@elio/db";
import {
  activeMemberEnrolmentWhere,
  newSignupsPatientWhere,
  startOfCurrentMonth,
} from "@elio/plans-engine";

export type DashboardStats = {
  activeMembers: number;
  monthlyRevenuePence: number;
  failedPaymentsThisMonth: number;
  newSignupsThisMonth: number;
};

export type DashboardActivityEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  actorLabel: string;
  createdAt: string;
};

function startOfCurrentMonthLocal(): Date {
  return startOfCurrentMonth();
}

const ACTIVE_MEMBER_ENROLMENT_WHERE = activeMemberEnrolmentWhere;

/** Legacy-parity dashboard metrics (P3.1). */
export async function getDashboardStats(practiceId: string): Promise<DashboardStats> {
  const db = scopedDb(practiceId);
  const startOfMonth = startOfCurrentMonthLocal();
  const activeEnrolmentWhere = ACTIVE_MEMBER_ENROLMENT_WHERE(practiceId);

  const [activeMembers, activeEnrolments, failedPaymentsThisMonth, newSignupsThisMonth] = await Promise.all([
    // Legacy counts active PatientPlan rows with ACTIVE patient + ACTIVE mandate.
    db.patientPlanEnrolment.count({ where: activeEnrolmentWhere }),
    db.patientPlanEnrolment.findMany({
      where: activeEnrolmentWhere,
      include: { plan: { select: { monthlyPricePence: true } } },
    }),
    db.planPayment.count({
      where: { practiceId, status: "FAILED", createdAt: { gte: startOfMonth } },
    }),
    // Legacy uses signupCompletedAt — proxy: mandate linked this month, or free child enrolled.
    db.planPatient.count({
      where: newSignupsPatientWhere(practiceId, startOfMonth),
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

/** Last 10 audit entries for dashboard activity feed (P3.2). */
export async function getDashboardRecentActivity(practiceId: string): Promise<DashboardActivityEntry[]> {
  const db = scopedDb(practiceId);
  const logs = await db.auditLog.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { email: true } } },
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    metadata: (log.metadata as Record<string, unknown> | null) ?? null,
    actorLabel: log.actor?.email ?? "System",
    createdAt: log.createdAt.toISOString(),
  }));
}

export function formatDashboardAction(action: string): string {
  return action
    .replace(/^plans\./, "")
    .replace(/[._]/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function activityDetailLabel(entry: DashboardActivityEntry): string {
  const meta = entry.metadata ?? {};
  const name =
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.patientName === "string" && meta.patientName) ||
    (typeof meta.email === "string" && meta.email) ||
    "";
  return name || entry.targetType;
}
