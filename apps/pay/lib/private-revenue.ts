import type { TreatmentRecord } from "@elio/pay-engine";

/** Maps stored PrivateRevenueLineItem rows to pay-engine TreatmentRecords (Y1.7). */
export function privateRevenueItemsToTreatments(
  dentistId: string,
  items: Array<{ amountPence: number; excludedAsConsultation: boolean; treatmentId?: string | null; id?: string }>,
  periodCompletedAtIso: string
): TreatmentRecord[] {
  return items.map((item, index) => ({
    id: item.treatmentId ?? item.id ?? `fetched-${index}`,
    dentistId,
    completedAt: periodCompletedAtIso,
    amountPence: item.amountPence,
    isCosmeticConsultation: item.excludedAsConsultation,
  }));
}

/** AuraPay: therapy deduction = minutes × £/min, as integer pence.
 * Default rate 0.5833 when minutes > 0 and rate missing/0 (legacy AuraPay). */
export const DEFAULT_THERAPY_RATE_PER_MINUTE = 0.5833;

export function therapyDeductionPence(therapyMinutes: number | null | undefined, ratePerMinute: number | null | undefined): number {
  const mins = Number(therapyMinutes ?? 0);
  if (!(mins > 0)) return 0;
  const rate = Number(ratePerMinute ?? 0);
  const effectiveRate = rate > 0 ? rate : DEFAULT_THERAPY_RATE_PER_MINUTE;
  return Math.round(mins * effectiveRate * 100);
}

/**
 * AuraPay finance fee deduction: sum of per-patient finance fees × split (default 50%).
 * Fees come from line metadata when captured; otherwise 0 (Tabeo term rates = Y3.5 settings).
 */
export function financeFeesDeductionPence(
  lines: Array<{ financeFeePence?: number | null }>,
  split = 0.5
): number {
  const totalFees = lines.reduce((sum, li) => sum + (li.financeFeePence ?? 0), 0);
  return Math.round(totalFees * split);
}
