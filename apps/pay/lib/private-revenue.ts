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

/** AuraPay: therapy deduction = minutes × £/min, as integer pence. */
export function therapyDeductionPence(therapyMinutes: number | null | undefined, ratePerMinute: number | null | undefined): number {
  const mins = Number(therapyMinutes ?? 0);
  const rate = Number(ratePerMinute ?? 0);
  if (!(mins > 0) || !(rate > 0)) return 0;
  return Math.round(mins * rate * 100);
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
