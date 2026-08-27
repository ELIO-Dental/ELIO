/**
 * Pay-engine calculation core — APPLICATION_FLOW.md §6.3-6.5.
 *
 * Pure functions only (no DB/Prisma imports) so they're trivially unit-testable and so
 * the caller (an apps/pay API route or background job, per PERFORMANCE_SCALABILITY.md §1)
 * controls all I/O. All money is integer pence throughout (docs/adr/0002).
 */

import { isDateInPeriod } from "./period";

export interface TreatmentRecord {
  id: string;
  dentistId: string;
  completedAt: string | null; // ISO date/datetime, null = not completed (excluded)
  amountPence: number | null;
  /**
   * Reliable treatment-type match, per §6.3: "NOT a fragile string match on a free-text
   * description field — use Dentally's treatment category/code if the sync exposes one."
   * DATA_MODEL.md §2 confirms the core sync does NOT currently expose this field (flagged,
   * not silently built) — callers must resolve it via packages/dentally's catalog endpoint
   * (GET /v1/treatments) and pass the result in here. This function itself never guesses.
   */
  isCosmeticConsultation: boolean;
}

export interface PrivateEarningsResult {
  grossPrivateRevenuePence: number;
  consultationExclusionsPence: number;
  privateEarningsPence: number;
  lineItems: Array<{
    treatmentId: string;
    amountPence: number;
    excludedAsConsultation: boolean;
  }>;
}

/**
 * §6.3 — private earnings from ONLY this dentist's actually-completed treatment in the
 * exact period, with £50 cosmetic consultations excluded entirely (100% stays with the
 * practice — never counted in gross, never split).
 */
export function calculatePrivateEarnings(
  dentistId: string,
  treatments: TreatmentRecord[],
  periodStart: string,
  periodEnd: string,
  privateSplitPercent: number
): PrivateEarningsResult {
  let grossPrivateRevenuePence = 0;
  let consultationExclusionsPence = 0;
  const lineItems: PrivateEarningsResult["lineItems"] = [];

  for (const t of treatments) {
    // Only THIS dentist's treatment — another dentist's never counts.
    if (t.dentistId !== dentistId) continue;
    // Only ACTUALLY COMPLETED (not planned/future) treatment.
    if (!t.completedAt) continue;
    // Strictly within the exact calendar-month period.
    if (!isDateInPeriod(t.completedAt, periodStart, periodEnd)) continue;

    const amount = t.amountPence ?? 0;

    if (t.isCosmeticConsultation) {
      consultationExclusionsPence += amount;
      lineItems.push({ treatmentId: t.id, amountPence: amount, excludedAsConsultation: true });
      continue; // excluded entirely — does not enter gross
    }

    grossPrivateRevenuePence += amount;
    lineItems.push({ treatmentId: t.id, amountPence: amount, excludedAsConsultation: false });
  }

  const privateEarningsPence = Math.round((grossPrivateRevenuePence * privateSplitPercent) / 100);

  return { grossPrivateRevenuePence, consultationExclusionsPence, privateEarningsPence, lineItems };
}

export interface PercentageSplitPayslipInput {
  payType: "PERCENTAGE_SPLIT";
  udas: number | null;
  udaRatePence: number | null; // ELIO's own configured rate (§6.2 — never from the statement)
  grossPrivateRevenuePence: number;
  privateSplitPercent: number;
  privateEarningsPence: number;
  consultationExclusionsPence: number;
  labDeductionPence: number; // 50% of attributable lab bills (§6.4)
  superannuationPence: number; // from Compass, deducted in full (§6.4)
  manualAdjustmentsPence?: number;
}

export interface HourlyPayslipInput {
  payType: "HOURLY";
  hoursWorked: number;
  hourlyRatePence: number;
  manualAdjustmentsPence?: number;
}

export type PayslipCalcInput = PercentageSplitPayslipInput | HourlyPayslipInput;

/** §6.5 — final formula, branched by payType. Returns the final amount in pence. */
export function calculateFinalPay(input: PayslipCalcInput): number {
  const adjustments = input.manualAdjustmentsPence ?? 0;

  if (input.payType === "PERCENTAGE_SPLIT") {
    const udaRatePence = input.udaRatePence ?? 0;
    const udas = input.udas ?? 0;
    const nhsEarningsPence = Math.round(udas * udaRatePence);
    return (
      nhsEarningsPence +
      input.privateEarningsPence -
      input.labDeductionPence -
      input.superannuationPence +
      adjustments
    );
  }

  // HOURLY
  const hourlyEarningsPence = Math.round(input.hoursWorked * input.hourlyRatePence);
  return hourlyEarningsPence + adjustments;
}

/** §6.4 — 50% of a dentist's attributable lab bills for the period is deducted from pay. */
export function calculateLabDeduction(labBillsPence: number[]): number {
  const total = labBillsPence.reduce((sum, v) => sum + v, 0);
  return Math.round(total / 2);
}

/** §6.2 — NHS earnings = UDAs (Compass "Current Financial Year" figure) × ELIO's configured rate. */
export function calculateNhsEarnings(udas: number, udaRatePence: number): number {
  return Math.round(udas * udaRatePence);
}
