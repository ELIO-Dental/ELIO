import { scopedDb } from "@elio/db";
import { ACTIVE_DENTIST_WHERE } from "./active-dentists";

/**
 * AuraPay created a payslip row per active dentist at period open.
 * Seed empty stubs so ops can enter labs/therapy/UDAs before Dentally fetch.
 */
export async function ensurePayslipStubsForPeriod(practiceId: string, payPeriodId: string): Promise<number> {
  const db = scopedDb(practiceId);
  const period = await db.payPeriod.findUnique({
    where: { id: payPeriodId },
    select: { id: true, status: true },
  });
  if (!period || period.status === "LOCKED") return 0;

  const [dentists, existing] = await Promise.all([
    db.dentist.findMany({
      where: ACTIVE_DENTIST_WHERE,
      select: {
        id: true,
        payType: true,
        privateSplitPercent: true,
        udaRatePence: true,
        hourlyRatePence: true,
      },
    }),
    db.payslipEntry.findMany({
      where: { payPeriodId },
      select: { dentistId: true },
    }),
  ]);

  const have = new Set(existing.map((e) => e.dentistId));
  let created = 0;
  for (const d of dentists) {
    if (have.has(d.id)) continue;
    await db.payslipEntry.create({
      data: {
        practiceId,
        payPeriodId,
        dentistId: d.id,
        payType: d.payType,
        privateSplitPercent: d.privateSplitPercent,
        udaRatePence: d.udaRatePence,
        hourlyRatePence: d.hourlyRatePence,
      },
    });
    created++;
  }
  return created;
}
