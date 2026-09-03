/** Default paid conversion threshold — £450 in pence (legacy ElioFlow). */
export const DEFAULT_PAID_CONVERSION_THRESHOLD_PENCE = 45_000;

/**
 * Legacy ElioFlow conversion rule (pipeline.ts):
 * status converted/completed (→ ACCEPTED) OR (deposit OR paid ≥ £450) AND treatment booked.
 * ElioCare / planSignedUp is tracked separately and does NOT alone count as converted.
 */
export function isLegacyConverted(
  c: {
    outcome: string | null;
    planSignedUp?: boolean;
    hasDeposit: boolean | null;
    totalPaidPence: number | null;
    treatmentBooked: boolean | null;
  },
  paidConversionThresholdPence = DEFAULT_PAID_CONVERSION_THRESHOLD_PENCE
): boolean {
  if (c.outcome === "ACCEPTED") return true;
  const paidEnough =
    Boolean(c.hasDeposit) || (c.totalPaidPence ?? 0) >= paidConversionThresholdPence;
  return paidEnough && Boolean(c.treatmentBooked);
}
