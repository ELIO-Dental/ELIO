/**
 * Step 16 — Tabeo finance term → suggested fee + provisional rules.
 */

import { parseRateToBasisPoints } from "./money-pence";

export const FINANCE_TERMS_MONTHS = [3, 12, 36, 60] as const;
export type FinanceTermMonths = (typeof FINANCE_TERMS_MONTHS)[number];

export const DEFAULT_FINANCE_TERM_MONTHS: FinanceTermMonths = 12;

export function isValidFinanceTerm(months: unknown): months is FinanceTermMonths {
  return FINANCE_TERMS_MONTHS.includes(Number(months) as FinanceTermMonths);
}

/** Map term months → rate basis points (800 = 8%). */
export function resolveFinanceRateBpForTerm(
  settings: {
    finance_rate_3m?: string;
    finance_rate_12m?: string;
    finance_rate_36m?: string;
    finance_rate_60m?: string;
  },
  months: FinanceTermMonths
): number {
  const key =
    months === 3
      ? "finance_rate_3m"
      : months === 12
        ? "finance_rate_12m"
        : months === 36
          ? "finance_rate_36m"
          : "finance_rate_60m";
  const fallback = months === 12 ? 800 : 0;
  return parseRateToBasisPoints(settings[key] ?? (months === 12 ? "0.08" : "0"), fallback);
}

/** @deprecated Use resolveFinanceRateBpForTerm — returns decimal for UI display only. */
export function resolveFinanceRateForTerm(
  settings: {
    finance_rate_3m?: string;
    finance_rate_12m?: string;
    finance_rate_36m?: string;
    finance_rate_60m?: string;
  },
  months: FinanceTermMonths
): number {
  return resolveFinanceRateBpForTerm(settings, months) / 10_000;
}

/** Suggested fee in pence = amount × rateBp / 10000 (integer). */
export function suggestFinanceFeePence(amountPence: number, rateBpOrDecimal: number): number {
  if (!(amountPence > 0) || !(rateBpOrDecimal >= 0)) return 0;
  // Legacy: decimal ≤1 treated as fraction; otherwise basis points.
  const bp = rateBpOrDecimal <= 1 ? Math.round(rateBpOrDecimal * 10_000) : Math.round(rateBpOrDecimal);
  return Math.round((amountPence * bp) / 10_000);
}

export type FinanceLineForFee = {
  isFinance?: boolean | null;
  amountPence: number;
  financeFeePence?: number | null;
  financeTermMonths?: number | null;
  financeFeeManual?: boolean | null;
};

/**
 * Resolve fee pence for a finance line:
 * - Manual fee → keep
 * - Fee + term saved → keep fee
 * - Term only → suggest amount × rate
 * - Neither → default 12m @ settings 12m rate (usedDefault → provisional)
 */
export function resolveFinanceFeeForLine(
  line: FinanceLineForFee,
  settings: {
    finance_rate_3m?: string;
    finance_rate_12m?: string;
    finance_rate_36m?: string;
    finance_rate_60m?: string;
  }
): { feePence: number; termMonths: FinanceTermMonths; usedDefault: boolean } {
  const hasTerm = isValidFinanceTerm(line.financeTermMonths);
  const term: FinanceTermMonths = hasTerm
    ? (line.financeTermMonths as FinanceTermMonths)
    : DEFAULT_FINANCE_TERM_MONTHS;

  if (line.financeFeeManual && line.financeFeePence != null && line.financeFeePence >= 0) {
    return { feePence: line.financeFeePence, termMonths: term, usedDefault: false };
  }
  if (hasTerm && line.financeFeePence != null && line.financeFeePence >= 0) {
    return { feePence: line.financeFeePence, termMonths: term, usedDefault: false };
  }
  if (!hasTerm && line.financeFeePence != null && line.financeFeePence > 0) {
    return {
      feePence: line.financeFeePence,
      termMonths: DEFAULT_FINANCE_TERM_MONTHS,
      usedDefault: true,
    };
  }

  const rateBp = resolveFinanceRateBpForTerm(settings, term);
  return {
    feePence: suggestFinanceFeePence(line.amountPence, rateBp),
    termMonths: term,
    usedDefault: !hasTerm,
  };
}

/** Needs ops attention when finance and neither term nor fee saved (and/or). */
export function lineNeedsFinanceTermOrFee(line: FinanceLineForFee): boolean {
  if (!line.isFinance) return false;
  const hasTerm = isValidFinanceTerm(line.financeTermMonths);
  // Step 29 — fee=0 does not count as confirmed unless ops marked it manual.
  const hasFee =
    line.financeFeeManual === true
      ? line.financeFeePence != null && line.financeFeePence >= 0
      : line.financeFeePence != null && line.financeFeePence > 0;
  return !(hasTerm || hasFee);
}

/** Payslip provisional if any finance line still lacks term and fee. */
export function payslipIsProvisional(lines: FinanceLineForFee[]): boolean {
  return lines.some((l) => Boolean(l.isFinance) && lineNeedsFinanceTermOrFee(l));
}

/** Fees for deduction: resolve suggested/default fees without requiring DB write. */
export function resolveFinanceFeesForDeduction(
  lines: FinanceLineForFee[],
  settings: {
    finance_rate_3m?: string;
    finance_rate_12m?: string;
    finance_rate_36m?: string;
    finance_rate_60m?: string;
  }
): Array<{ financeFeePence: number }> {
  return lines
    .filter((l) => Boolean(l.isFinance))
    .map((l) => ({ financeFeePence: resolveFinanceFeeForLine(l, settings).feePence }));
}
