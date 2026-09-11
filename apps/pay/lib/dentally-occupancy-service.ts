import { scopedDb } from "@elio/db";
import { getPayPeriodBoundaries } from "@elio/pay-engine";
import { toPracticeDateString } from "./dentally-fetch-invoices";
import {
  calculateDiaryMetrics,
  generateDefaultWorkingHours,
  type DiaryMetrics,
} from "./dentally-occupancy";

export interface DentistOccupancy extends DiaryMetrics {
  dentistId: string;
  dentistName: string;
}

/**
 * Occupancy/white-space per active dentist for a pay period, computed from
 * already-synced Appointment rows (no live Dentally call — see
 * dentally-occupancy.ts for why this doesn't replicate AuraPay's separate
 * "schedule" fetch).
 */
export async function loadPeriodOccupancy(
  practiceId: string,
  payPeriodId: string
): Promise<{ dateRange: { start: string; endExclusive: string }; results: DentistOccupancy[] }> {
  const db = scopedDb(practiceId);
  const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found");

  const startDate = toPracticeDateString(payPeriod.periodStart);
  const periodMonth = Number(startDate.slice(5, 7));
  const periodYear = Number(startDate.slice(0, 4));
  const { endDate: endExclusive } = getPayPeriodBoundaries(periodMonth, periodYear);

  const dentists = await db.dentist.findMany({
    where: { practiceId, active: true, dentallyPractitionerId: { not: null } },
    select: { id: true, name: true, dentallyPractitionerId: true },
  });

  if (dentists.length === 0) {
    return { dateRange: { start: startDate, endExclusive }, results: [] };
  }

  const practitionerIds = dentists
    .map((d) => d.dentallyPractitionerId)
    .filter((id): id is string => id != null);

  const appointments = await db.appointment.findMany({
    where: {
      practiceId,
      practitionerId: { in: practitionerIds },
      startsAt: { gte: new Date(`${startDate}T00:00:00Z`), lt: new Date(`${endExclusive}T00:00:00Z`) },
    },
    select: { practitionerId: true, startsAt: true, endsAt: true, dentallyState: true },
  });

  const availabilityBlocks = generateDefaultWorkingHours(startDate, endExclusive);

  const results: DentistOccupancy[] = dentists.map((dentist) => {
    const own = appointments.filter((a) => a.practitionerId === dentist.dentallyPractitionerId);
    const metrics = calculateDiaryMetrics(own, availabilityBlocks);
    return { dentistId: dentist.id, dentistName: dentist.name, ...metrics };
  });

  return { dateRange: { start: startDate, endExclusive }, results };
}
