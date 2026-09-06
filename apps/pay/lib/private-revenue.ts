import type { TreatmentRecord } from "@elio/pay-engine";
import { lineCountsTowardGross, type RevenueLineForGross } from "./payment-flags";
import { applySharePence } from "./money-pence";

/** Maps stored PrivateRevenueLineItem rows to pay-engine TreatmentRecords (Y1.7).
 * Step 10 / PDF §4.3: unpaid / partial / flagged lines never enter gross. */
export function privateRevenueItemsToTreatments(
  dentistId: string,
  items: Array<
    RevenueLineForGross & {
      excludedAsConsultation: boolean;
      treatmentId?: string | null;
      id?: string;
    }
  >,
  periodCompletedAtIso: string
): TreatmentRecord[] {
  return items
    .filter((item) => lineCountsTowardGross(item))
    .map((item, index) => ({
      id: item.treatmentId ?? item.id ?? `fetched-${index}`,
      dentistId,
      completedAt: periodCompletedAtIso,
      amountPence: item.amountPence,
      isCosmeticConsultation: item.excludedAsConsultation,
    }));
}

/** Step 18 / 20: therapy deduction in integer pence via hourly pence. */
export const DEFAULT_THERAPY_HOURLY_PENCE = 3500; // £35/hour
/** Legacy display default (£35/60) — boundary/UI only. */
export const DEFAULT_THERAPY_RATE_PER_MINUTE = 0.5833;

/**
 * Therapy = minutes × hourly_pence / 60.
 * Prefer explicit ratePerMinute (£) → convert to hourly pence; else dentist/practice hourly pence; else £35/hr.
 */
export function therapyDeductionPence(
  therapyMinutes: number | null | undefined,
  ratePerMinute: number | null | undefined,
  hourlyPenceOverride?: number | null
): number {
  const mins = Number(therapyMinutes ?? 0);
  if (!(mins > 0)) return 0;
  const rate = Number(ratePerMinute ?? 0);
  let hourlyPence = DEFAULT_THERAPY_HOURLY_PENCE;
  if (rate > 0) {
    hourlyPence = Math.round(rate * 60 * 100);
  } else if (hourlyPenceOverride != null && hourlyPenceOverride > 0) {
    hourlyPence = Math.round(hourlyPenceOverride);
  }
  return Math.round((mins * hourlyPence) / 60);
}

/**
 * Finance fee deduction: sum of fees × share (shareBp, default 5000 = 50%).
 * Accepts legacy float share ≤1 for compatibility.
 */
export function financeFeesDeductionPence(
  lines: Array<{ financeFeePence?: number | null }>,
  shareBp = 5000
): number {
  const totalFees = lines.reduce((sum, li) => sum + (li.financeFeePence ?? 0), 0);
  const bp = shareBp <= 1 ? Math.round(shareBp * 10_000) : Math.round(shareBp);
  return applySharePence(totalFees, bp);
}
