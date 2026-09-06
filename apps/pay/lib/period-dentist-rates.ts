import type { DentistRateSnapshot } from "./dentist-rates";
import { periodRatesAsOfDate, resolveDentistRatesAsOf } from "./dentist-rates";

type DentistLike = {
  id: string;
  privateSplitPercent: unknown;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
  labShareBp: number | null;
  financeShareBp: number | null;
  therapyHourlyPence: number | null;
};

type HistoryRow = {
  dentistId: string;
  effectiveFrom: Date;
  privateSplitPercent: unknown;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
  labShareBp: number | null;
  financeShareBp: number | null;
  therapyHourlyPence: number | null;
};

/** Resolve as-of rates for many dentists in one period (PDF/email bulk paths). */
export function resolvePeriodRatesByDentistId(
  dentists: DentistLike[],
  historyRows: HistoryRow[],
  periodEndExclusive: Date
): Map<string, DentistRateSnapshot> {
  const asOf = periodRatesAsOfDate(periodEndExclusive);
  const byDentist = new Map<string, HistoryRow[]>();
  for (const h of historyRows) {
    const list = byDentist.get(h.dentistId) ?? [];
    list.push(h);
    byDentist.set(h.dentistId, list);
  }
  const out = new Map<string, DentistRateSnapshot>();
  for (const d of dentists) {
    const history = (byDentist.get(d.id) ?? []).map((h) => ({
      effectiveFrom: h.effectiveFrom,
      privateSplitPercent: h.privateSplitPercent != null ? Number(h.privateSplitPercent) : null,
      udaRatePence: h.udaRatePence,
      hourlyRatePence: h.hourlyRatePence,
      labShareBp: h.labShareBp,
      financeShareBp: h.financeShareBp,
      therapyHourlyPence: h.therapyHourlyPence,
    }));
    out.set(
      d.id,
      resolveDentistRatesAsOf(
        {
          privateSplitPercent: d.privateSplitPercent != null ? Number(d.privateSplitPercent) : null,
          udaRatePence: d.udaRatePence,
          hourlyRatePence: d.hourlyRatePence,
          labShareBp: d.labShareBp,
          financeShareBp: d.financeShareBp,
          therapyHourlyPence: d.therapyHourlyPence,
        },
        history,
        asOf
      )
    );
  }
  return out;
}
