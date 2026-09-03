/**
 * Pure helpers for Flow financial sync merge rules.
 * Prevents empty Dentally core from wiping migrated Sheet totals.
 */

export type ConsultFinancialSnapshot = {
  totalPaidPence: number | null;
  hasDeposit: boolean | null;
  treatmentBooked: boolean | null;
  quotePence: number | null;
  quotePenceOverride: number | null;
};

export type ComputedFinancials = {
  totalPaidPence: number;
  hasDeposit: boolean;
  treatmentBooked: boolean;
  quotePence?: number | null;
};

export type FinancialSyncContext = {
  /** True when dentally_payments has at least one row for this patient. */
  hasPaymentRows: boolean;
  /** True when dentally_appointments has at least one row for this patient (any date). */
  hasAppointmentRows: boolean;
  /** True when dentally_accounts has a row we can read planned value from. */
  hasAccountRow: boolean;
};

/**
 * Merge computed core financials onto an existing consult.
 * - Empty payment cache must not zero migrated totalPaid / hasDeposit.
 * - treatmentBooked stays sticky-true (legacy Sheet froze the flag).
 * - quote only updates from account when override is unset and an account exists.
 */
export function mergeConsultFinancialUpdate(
  existing: ConsultFinancialSnapshot,
  computed: ComputedFinancials,
  ctx: FinancialSyncContext
): Partial<ComputedFinancials> {
  const patch: Partial<ComputedFinancials> = {};

  if (ctx.hasPaymentRows) {
    patch.totalPaidPence = computed.totalPaidPence;
    patch.hasDeposit = computed.hasDeposit;
  }
  // else: preserve existing paid/deposit (do not write zeros)

  if (ctx.hasAppointmentRows) {
    // Sticky true: once treatment was booked, don't clear when appointment completes.
    patch.treatmentBooked = Boolean(existing.treatmentBooked) || computed.treatmentBooked;
  } else if (computed.treatmentBooked) {
    patch.treatmentBooked = true;
  }
  // else: no appointment data and not booked → preserve existing

  if (existing.quotePenceOverride == null && ctx.hasAccountRow && computed.quotePence !== undefined) {
    patch.quotePence = computed.quotePence;
  }

  return patch;
}
