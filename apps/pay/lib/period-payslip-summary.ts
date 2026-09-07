import { computePayslipExpandedMetrics } from "./payslip-expanded-metrics";
import { resolveShareBp } from "./dentist-rates";

export type PeriodPayslipSummaryRow = {
  id: string;
  dentistName: string;
  udasLabel: string;
  nhsIncomePence: number;
  /** All invoice amounts (invoiced) — may exceed payable until unpaid cleared. */
  invoicedGrossPence: number;
  /** Paid-only gross used for payable calc (null until Run calculation). */
  payableGrossPence: number | null;
  /** @deprecated Use invoicedGrossPence / payableGrossPence — kept as invoiced for table Gross col. */
  grossPence: number;
  splitPercentLabel: string;
  netPrivatePence: number | null;
  labDeductionPence: number;
  financeDeductionPence: number;
  therapyDeductionPence: number;
  adjustmentsPence: number;
  /** Null until Run calculation — never coerce to £0. */
  totalPaymentPence: number | null;
  calculated: boolean;
  provisional: boolean;
};

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
  /** Sum of all private line amountPence (invoiced). */
  invoicedGrossPence?: number | null;
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

  const calculated = source.finalPayPence != null;
  const invoicedGrossPence =
    source.invoicedGrossPence != null ? source.invoicedGrossPence : metrics.grossPrivatePence;

  return {
    id: source.id,
    dentistName: source.dentistName,
    udasLabel: source.payType === "HOURLY" ? "—" : formatDecimalLabel(source.udas),
    nhsIncomePence: metrics.nhsIncomePence,
    invoicedGrossPence,
    payableGrossPence: calculated ? metrics.grossPrivatePence : null,
    grossPence: invoicedGrossPence,
    splitPercentLabel:
      source.payType === "HOURLY" ? "—" : formatDecimalLabel(source.privateSplitPercent, "%"),
    netPrivatePence: calculated ? metrics.netPrivatePence : null,
    labDeductionPence: metrics.labDeductionPence,
    financeDeductionPence: metrics.financeFeesDeductionPence,
    therapyDeductionPence: metrics.therapyDeductionPence,
    adjustmentsPence: source.manualAdjustmentsPence ?? 0,
    totalPaymentPence: source.finalPayPence,
    calculated,
    provisional: source.provisional,
  };
}

export function buildPeriodPayslipSummaryRows(
  sources: PeriodPayslipSummarySource[]
): PeriodPayslipSummaryRow[] {
  return sources.map(buildPeriodPayslipSummaryRow);
}

/** Period-level payroll banner totals (null-safe). */
export function sumPeriodPayrollTotals(rows: PeriodPayslipSummaryRow[]): {
  dentistCount: number;
  calculatedCount: number;
  totalPaymentPence: number | null;
  invoicedGrossPence: number;
  nhsIncomePence: number;
  deductionsPence: number;
} {
  const dentistCount = rows.length;
  const calculatedCount = rows.filter((r) => r.calculated).length;
  let invoicedGrossPence = 0;
  let nhsIncomePence = 0;
  let deductionsPence = 0;
  let totalPaymentPence: number | null = calculatedCount === dentistCount && dentistCount > 0 ? 0 : null;
  for (const r of rows) {
    invoicedGrossPence += r.invoicedGrossPence;
    nhsIncomePence += r.nhsIncomePence;
    deductionsPence += r.labDeductionPence + r.financeDeductionPence + r.therapyDeductionPence;
    if (totalPaymentPence != null && r.totalPaymentPence != null) {
      totalPaymentPence += r.totalPaymentPence;
    }
  }
  return { dentistCount, calculatedCount, totalPaymentPence, invoicedGrossPence, nhsIncomePence, deductionsPence };
}
