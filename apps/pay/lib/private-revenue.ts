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
