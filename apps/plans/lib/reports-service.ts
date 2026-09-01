import { scopedDb } from "@elio/db";

export type ReportsData = {
  overview: {
    totalPatients: number;
    activePatients: number;
    pausedPatients: number;
    cancelledPatients: number;
    invitedPatients: number;
    totalPlans: number;
    activePlans: number;
  };
  revenue: {
    totalCollectedPence: number;
    totalPendingPence: number;
    totalFailedPence: number;
    avgPerPatientPence: number;
  };
  redeems: {
    totalRedeems: number;
    approvedRedeems: number;
    pendingRedeems: number;
    rejectedRedeems: number;
    redeemsByType: Record<string, number>;
  };
  breakage: {
    patientsNotRedeeming: number;
    totalActivePatients: number;
    breakageRate: number;
  };
};

/** Legacy-parity reports payload (P3.4). */
export async function getReportsData(practiceId: string): Promise<ReportsData> {
  const db = scopedDb(practiceId);

  const [
    totalPatients,
    activePatients,
    pausedPatients,
    cancelledPatients,
    invitedPatients,
    totalPlans,
    activePlans,
    paidOutPayments,
    pendingPayments,
    failedPayments,
    totalRedeems,
    approvedRedeems,
    pendingRedeems,
    rejectedRedeems,
    redeemsByType,
    patientsWithApprovedRedeems,
  ] = await Promise.all([
    db.planPatient.count(),
    db.planPatient.count({ where: { status: "ACTIVE" } }),
    db.planPatient.count({ where: { status: "PAUSED" } }),
    db.planPatient.count({ where: { status: "CANCELLED" } }),
    db.planPatient.count({ where: { status: "INVITED" } }),
    db.planModel.count({ where: { isCurrentVersion: true } }),
    db.planModel.count({ where: { isCurrentVersion: true, active: true } }),
    db.planPayment.aggregate({ where: { status: "PAID_OUT" }, _sum: { amountPence: true } }),
    db.planPayment.aggregate({ where: { status: "PENDING" }, _sum: { amountPence: true } }),
    db.planPayment.aggregate({ where: { status: "FAILED" }, _sum: { amountPence: true } }),
    db.planRedeem.count(),
    db.planRedeem.count({ where: { status: "APPROVED" } }),
    db.planRedeem.count({ where: { status: "PENDING_APPROVAL" } }),
    db.planRedeem.count({ where: { status: "REJECTED" } }),
    db.planRedeem.groupBy({ by: ["itemType"], _count: { id: true } }),
    db.planRedeem.findMany({
      where: { status: "APPROVED" },
      select: { planPatientId: true },
      distinct: ["planPatientId"],
    }),
  ]);

  const totalCollectedPence = paidOutPayments._sum.amountPence ?? 0;
  const totalPendingPence = pendingPayments._sum.amountPence ?? 0;
  const totalFailedPence = failedPayments._sum.amountPence ?? 0;
  const avgPerPatientPence = activePatients > 0 ? Math.round(totalCollectedPence / activePatients) : 0;

  const patientsNotRedeeming = Math.max(0, activePatients - patientsWithApprovedRedeems.length);
  const breakageRate = activePatients > 0 ? (patientsNotRedeeming / activePatients) * 100 : 0;

  const redeemsByTypeMap: Record<string, number> = {};
  for (const row of redeemsByType) {
    redeemsByTypeMap[row.itemType] = row._count.id;
  }

  return {
    overview: {
      totalPatients,
      activePatients,
      pausedPatients,
      cancelledPatients,
      invitedPatients,
      totalPlans,
      activePlans,
    },
    revenue: {
      totalCollectedPence,
      totalPendingPence,
      totalFailedPence,
      avgPerPatientPence,
    },
    redeems: {
      totalRedeems,
      approvedRedeems,
      pendingRedeems,
      rejectedRedeems,
      redeemsByType: redeemsByTypeMap,
    },
    breakage: {
      patientsNotRedeeming,
      totalActivePatients: activePatients,
      breakageRate,
    },
  };
}

/** CSV export for financial reports (owner/admin/finance). */
export async function buildReportsCsv(practiceId: string): Promise<string> {
  const db = scopedDb(practiceId);
  const planPatients = await db.planPatient.findMany({
    include: {
      patient: true,
      planModel: { select: { name: true, monthlyPricePence: true } },
      patientPlans: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = [
    "First Name,Last Name,Email,Status,Plan,Monthly Price Pence,Last Payment Status,Created",
    ...planPatients.map((pp) => {
      const plan = pp.patientPlans[0]?.plan ?? pp.planModel;
      const lastPayment = pp.payments[0];
      const cols = [
        pp.patient.firstName ?? "",
        pp.patient.lastName ?? "",
        pp.patient.email ?? "",
        pp.status,
        plan?.name ?? "None",
        String(plan?.monthlyPricePence ?? 0),
        lastPayment?.status ?? "N/A",
        pp.createdAt.toISOString(),
      ];
      return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    }),
  ];

  return rows.join("\n");
}
