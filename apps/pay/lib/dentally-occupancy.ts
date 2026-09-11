/**
 * Diary occupancy / "white space" reporting — ported from legacy AuraPay
 * (src/app/api/dentally/availability/route.ts), which computed this from a
 * live Dentally fetch. Here it's computed from already-synced Appointment
 * rows instead of a second live API call, since the practice's diary is
 * already pulled into Postgres by the regular Dentally sync — the old
 * app's separate "schedule" endpoint call was itself best-effort (silently
 * falling back to a default working week whenever it failed), so this
 * keeps that same default-hours fallback as the only availability source.
 */

export interface OccupancyAppointment {
  practitionerId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  dentallyState: string | null;
}

export interface AvailabilityBlock {
  date: string; // YYYY-MM-DD
  availableMins: number;
}

export interface DailyOccupancy {
  date: string;
  availableMins: number;
  bookedMins: number;
  whiteSpaceMins: number;
  occupancyPercent: number;
}

export interface DiaryMetrics {
  totalAvailableMins: number;
  totalBookedMins: number;
  totalWhiteSpaceMins: number;
  occupancyPercent: number;
  whiteSpacePercent: number;
  dailyBreakdown: DailyOccupancy[];
}

/** A cancelled/DNA/failed appointment never occupied chair time. */
export function isAttendedAppointmentState(state: string | null | undefined): boolean {
  const s = (state ?? "").toLowerCase();
  return !s.includes("cancel") && !s.includes("dna") && !s.includes("failed");
}

/** Default Mon-Fri working hours split evenly across a 5-day week. */
export function generateDefaultWorkingHours(
  startDate: string,
  endExclusive: string,
  weeklyHours = 40
): AvailabilityBlock[] {
  const blocks: AvailabilityBlock[] = [];
  const dailyMins = Math.round((weeklyHours / 5) * 60);

  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endExclusive}T00:00:00Z`);

  while (current < end) {
    const dayOfWeek = current.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      blocks.push({
        date: current.toISOString().slice(0, 10),
        availableMins: dailyMins,
      });
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return blocks;
}

/** Sum booked minutes per calendar date from attended appointments only. */
function bookedMinutesByDate(appointments: OccupancyAppointment[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const apt of appointments) {
    if (!apt.startsAt || !apt.endsAt) continue;
    if (!isAttendedAppointmentState(apt.dentallyState)) continue;

    const mins = Math.round((apt.endsAt.getTime() - apt.startsAt.getTime()) / 60000);
    // Max 8 hours per appointment — guards against a bad/duplicate sync row.
    if (!(mins > 0 && mins < 480)) continue;

    const date = apt.startsAt.toISOString().slice(0, 10);
    byDate.set(date, (byDate.get(date) ?? 0) + mins);
  }
  return byDate;
}

/** One practitioner's occupancy/white-space metrics for a date range. */
export function calculateDiaryMetrics(
  appointments: OccupancyAppointment[],
  availabilityBlocks: AvailabilityBlock[]
): DiaryMetrics {
  const bookedByDate = bookedMinutesByDate(appointments);

  const dailyBreakdown: DailyOccupancy[] = [];
  let totalAvailableMins = 0;
  let totalBookedMins = 0;

  for (const block of availabilityBlocks) {
    const bookedMins = bookedByDate.get(block.date) ?? 0;
    const whiteSpaceMins = Math.max(0, block.availableMins - bookedMins);
    const occupancy = block.availableMins > 0 ? (bookedMins / block.availableMins) * 100 : 0;

    dailyBreakdown.push({
      date: block.date,
      availableMins: block.availableMins,
      bookedMins,
      whiteSpaceMins,
      occupancyPercent: Math.round(occupancy * 10) / 10,
    });

    totalAvailableMins += block.availableMins;
    totalBookedMins += bookedMins;
  }

  const totalWhiteSpaceMins = Math.max(0, totalAvailableMins - totalBookedMins);
  const occupancyPercent = totalAvailableMins > 0 ? (totalBookedMins / totalAvailableMins) * 100 : 0;
  const whiteSpacePercent = totalAvailableMins > 0 ? (totalWhiteSpaceMins / totalAvailableMins) * 100 : 0;

  return {
    totalAvailableMins,
    totalBookedMins,
    totalWhiteSpaceMins,
    occupancyPercent: Math.round(occupancyPercent * 10) / 10,
    whiteSpacePercent: Math.round(whiteSpacePercent * 10) / 10,
    dailyBreakdown: dailyBreakdown.sort((a, b) => a.date.localeCompare(b.date)),
  };
}
