/**
 * Step 21 — resolve dentist rates for a pay period (versioned history).
 */

export type DentistRateSnapshot = {
  privateSplitPercent: number | null;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
  labShareBp: number | null;
  financeShareBp: number | null;
  therapyHourlyPence: number | null;
};

export type DentistRateHistoryRow = DentistRateSnapshot & {
  effectiveFrom: Date;
};

export type DentistCurrentRates = DentistRateSnapshot & {
  privateSplitPercent: number | null;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
  labShareBp: number | null;
  financeShareBp: number | null;
  therapyHourlyPence: number | null;
};

/** Inclusive last instant of a half-open period [start, end). */
export function periodRatesAsOfDate(periodEndExclusive: Date): Date {
  return new Date(periodEndExclusive.getTime() - 1);
}

/** Pick latest history row with effectiveFrom <= asOf, else current dentist columns. */
export function resolveDentistRatesAsOf(
  current: DentistCurrentRates,
  history: DentistRateHistoryRow[],
  asOf: Date
): DentistRateSnapshot {
  const applicable = history
    .filter((h) => h.effectiveFrom.getTime() <= asOf.getTime())
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
  const hit = applicable[0];
  if (!hit) {
    return {
      privateSplitPercent: current.privateSplitPercent,
      udaRatePence: current.udaRatePence,
      hourlyRatePence: current.hourlyRatePence,
      labShareBp: current.labShareBp,
      financeShareBp: current.financeShareBp,
      therapyHourlyPence: current.therapyHourlyPence,
    };
  }
  return {
    privateSplitPercent:
      hit.privateSplitPercent != null ? Number(hit.privateSplitPercent) : current.privateSplitPercent,
    udaRatePence: hit.udaRatePence ?? current.udaRatePence,
    hourlyRatePence: hit.hourlyRatePence ?? current.hourlyRatePence,
    labShareBp: hit.labShareBp ?? current.labShareBp,
    financeShareBp: hit.financeShareBp ?? current.financeShareBp,
    therapyHourlyPence: hit.therapyHourlyPence ?? current.therapyHourlyPence,
  };
}

/** Practice default share unless dentist override set. */
export function resolveShareBp(dentistBp: number | null | undefined, practiceBp: number): number {
  return dentistBp != null && dentistBp >= 0 ? dentistBp : practiceBp;
}
