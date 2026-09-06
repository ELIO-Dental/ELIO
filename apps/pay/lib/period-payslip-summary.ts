import { computePayslipExpandedMetrics } from "./payslip-expanded-metrics";
import { resolveShareBp } from "./dentist-rates";

export type PeriodPayslipSummarySource = {
  id: string;
  dentistName: string;
  payType: string;
  udas: unknown;
  privateSplitPercent: unknown;
  nhsEarningsPence: number | null;
  grossPrivateRevenuePence: number | null;
  privateEarningsPence: number | null;
  labDeductionPence: number | null;
  superannuationPence: number | null;
  therapyMinutes: number | null;
  therapyRatePerMinute: number | null;
  therapyHourlyPence?: number | null;
  financeLines: Array<{ financeFeePence?: number | null }>;
  financeShareBp: number | null | undefined;
  practiceFinanceBp: number;
  manualAdjustmentsPence: number | null;
  finalPayPence: number | null;
  provisional: boolean;
};

export type PeriodPayslipSummaryRow = {
  id: string;
  dentistName: string;
  udasLabel: string;
  nhsIncomePence: number;
  grossPence: number;
  splitPercentLabel: string;
  netPrivatePence: number;
  labDeductionPence: number;
  financeDeductionPence: number;
  therapyDeductionPence: number;
  adjustmentsPence: number;
  totalPaymentPence: number;
  provisional: boolean;
};

/** Stable display for Decimal / number (avoid raw Prisma .toString noise). */
export function formatDecimalLabel(value: unknown, suffix = ""): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 1000) / 1000;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return suffix ? `${text}${suffix}` : text;
}

/** Step 24 — one row per payslip for the period ops dashboard table. */
export function buildPeriodPayslipSummaryRow(source: PeriodPayslipSummarySource): PeriodPayslipSummaryRow {
  const financeFeeSplit = resolveShareBp(source.financeShareBp, source.practiceFinanceBp);
  const metrics = computePayslipExpandedMetrics({
    grossPrivateRevenuePence: source.grossPrivateRevenuePence,
    privateEarningsPence: source.privateEarningsPence,
    nhsEarningsPence: source.nhsEarningsPence,
    labDeductionPence: source.labDeductionPence,
    superannuationPence: source.superannuationPence,
    therapyMinutes: source.therapyMinutes,
    therapyRatePerMinute: source.therapyRatePerMinute,
    therapyHourlyPence: source.therapyHourlyPence,
    financeLines: source.financeLines,
    financeFeeSplit,
  });

  return {
    id: source.id,
    dentistName: source.dentistName,
    udasLabel: source.payType === "HOURLY" ? "—" : formatDecimalLabel(source.udas),
    nhsIncomePence: metrics.nhsIncomePence,
    grossPence: metrics.grossPrivatePence,
    splitPercentLabel:
      source.payType === "HOURLY" ? "—" : formatDecimalLabel(source.privateSplitPercent, "%"),
    netPrivatePence: metrics.netPrivatePence,
    labDeductionPence: metrics.labDeductionPence,
    financeDeductionPence: metrics.financeFeesDeductionPence,
    therapyDeductionPence: metrics.therapyDeductionPence,
    adjustmentsPence: source.manualAdjustmentsPence ?? 0,
    totalPaymentPence: source.finalPayPence ?? 0,
    provisional: source.provisional,
  };
}

export function buildPeriodPayslipSummaryRows(
  sources: PeriodPayslipSummarySource[]
): PeriodPayslipSummaryRow[] {
  return sources.map(buildPeriodPayslipSummaryRow);
}
