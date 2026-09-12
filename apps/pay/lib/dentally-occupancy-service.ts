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
 * The real UTC instant of Europe/London midnight for a given YYYY-MM-DD
 * practice date. `new Date(\`${ymd}T00:00:00Z\`)` is wrong during BST
 * (UTC+1) — London midnight is 23:00 UTC the previous day, not 00:00 UTC —
 * which would drop the first hour of each period's appointments and bleed
 * an hour into the next period's window (toPracticeDateString's own test
 * already documents this exact UTC/London gap for the reverse direction).
 */
export function londonMidnightUtc(ymd: string): Date {
  const guessUtcMidnight = new Date(`${ymd}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guessUtcMidnight);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // London is always UTC+0 (GMT) or UTC+1 (BST), so this guess reads as
  // London 00:00 or 01:00 — never wraps to a different calendar day.
  const minutesPastLondonMidnight = hour * 60 + minute;
  return new Date(guessUtcMidnight.getTime() - minutesPastLondonMidnight * 60_000);
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
      startsAt: { gte: londonMidnightUtc(startDate), lt: londonMidnightUtc(endExclusive) },
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
