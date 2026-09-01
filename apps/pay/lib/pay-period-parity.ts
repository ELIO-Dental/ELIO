/**
 * Compare legacy AuraPay net pay vs new Elio Pay final pay (Y4.2).
 * Tolerance default ±£1 (100 pence).
 */

import {
  legacyPayslipAdjustments,
  legacyPayslipLabBills,
  type LegacyPayslipRow,
} from "./legacy-payslip-archive";

export const DEFAULT_PAY_PARITY_TOLERANCE_PENCE = 100;

export interface LegacyAuraPayCalcInput {
  grossPrivatePounds: number;
  splitPercent: number;
  isNhs: boolean;
  nhsUdas: number;
  udaRatePounds: number;
  labBillsJson?: string;
  financeFeesPounds: number;
  therapyMinutes: number;
  therapyRatePerMinute: number;
  superannuationPounds: number;
  adjustmentsJson?: string;
  labBillSplit?: number;
  financeFeeSplit?: number;
}

export interface PayParityEntry {
  dentistName: string;
  legacyNetPayPence: number;
  newFinalPayPence: number;
  diffPence: number;
  withinTolerance: boolean;
}

export interface PayParityCompareResult {
  ok: boolean;
  tolerancePence: number;
  matched: PayParityEntry[];
  missingInNew: string[];
  missingInLegacy: string[];
}

export interface LegacyPayExportFile {
  period?: string;
  entries: Array<{ dentistName: string; netPayPounds: number }>;
}

function poundsToPence(value: number): number {
  return Math.round(value * 100);
}

/** Legacy AuraPay reporting-page net pay formula (pounds in, pence out). */
export function calculateLegacyAuraPayNetPayPence(input: LegacyAuraPayCalcInput): number {
  const labBills = input.labBillsJson ? legacyPayslipLabBills({ lab_bills_json: input.labBillsJson }) : [];
  const labTotal = labBills.reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);
  const adjustments = input.adjustmentsJson
    ? legacyPayslipAdjustments({ adjustments_json: input.adjustmentsJson })
    : [];
  const adjTotal = adjustments.reduce((sum, adj) => {
    const amount = Number(adj.amount) || 0;
    return sum + (adj.type === "addition" ? amount : -amount);
  }, 0);

  const labSplit = input.labBillSplit ?? 0.5;
  const financeSplit = input.financeFeeSplit ?? 0.5;
  const netPrivate = input.grossPrivatePounds * (input.splitPercent / 100);
  const nhsIncome = input.isNhs ? input.nhsUdas * input.udaRatePounds : 0;
  const labDeduction = labTotal * labSplit;
  const financeDeduction = input.financeFeesPounds * financeSplit;
  const therapyDeduction = input.therapyMinutes * input.therapyRatePerMinute;
  const netPounds =
    netPrivate +
    nhsIncome -
    labDeduction -
    financeDeduction -
    therapyDeduction -
    input.superannuationPounds +
    adjTotal;

  return Math.max(0, poundsToPence(netPounds));
}

export function calculateLegacyNetPayFromArchiveRow(
  row: LegacyPayslipRow,
  dentist: { splitPercent: number; isNhs: boolean; udaRatePounds: number }
): number {
  return calculateLegacyAuraPayNetPayPence({
    grossPrivatePounds: Number(row.gross_private) || 0,
    splitPercent: dentist.splitPercent,
    isNhs: dentist.isNhs,
    nhsUdas: Number(row.nhs_udas) || 0,
    udaRatePounds: dentist.udaRatePounds,
    labBillsJson: row.lab_bills_json,
    financeFeesPounds: Number(row.finance_fees) || 0,
    therapyMinutes: Number(row.therapy_minutes) || 0,
    therapyRatePerMinute: Number(row.therapy_rate) || 0.5833,
    superannuationPounds: Number(row.superannuation_deduction) || 0,
    adjustmentsJson: row.adjustments_json,
  });
}

export function compareNetPayParity(
  legacyNetPayPence: number,
  newFinalPayPence: number,
  tolerancePence = DEFAULT_PAY_PARITY_TOLERANCE_PENCE
): { withinTolerance: boolean; diffPence: number } {
  const diffPence = newFinalPayPence - legacyNetPayPence;
  return {
    withinTolerance: Math.abs(diffPence) <= tolerancePence,
    diffPence,
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function comparePeriodPayParity(
  legacyEntries: Array<{ dentistName: string; netPayPounds: number }>,
  newEntries: Array<{ dentistName: string; finalPayPence: number | null }>,
  tolerancePence = DEFAULT_PAY_PARITY_TOLERANCE_PENCE
): PayParityCompareResult {
  const legacyMap = new Map(
    legacyEntries.map((entry) => [normalizeName(entry.dentistName), entry])
  );
  const newMap = new Map(
    newEntries.map((entry) => [normalizeName(entry.dentistName), entry])
  );

  const matched: PayParityEntry[] = [];
  const missingInNew: string[] = [];
  const missingInLegacy: string[] = [];

  for (const [key, legacy] of legacyMap.entries()) {
    const nuevo = newMap.get(key);
    if (!nuevo) {
      missingInNew.push(legacy.dentistName);
      continue;
    }
    const legacyNetPayPence = poundsToPence(legacy.netPayPounds);
    const newFinalPayPence = nuevo.finalPayPence ?? 0;
    const { withinTolerance, diffPence } = compareNetPayParity(
      legacyNetPayPence,
      newFinalPayPence,
      tolerancePence
    );
    matched.push({
      dentistName: legacy.dentistName,
      legacyNetPayPence,
      newFinalPayPence,
      diffPence,
      withinTolerance,
    });
  }

  for (const [key, nuevo] of newMap.entries()) {
    if (!legacyMap.has(key)) missingInLegacy.push(nuevo.dentistName);
  }

  return {
    ok:
      missingInNew.length === 0 &&
      missingInLegacy.length === 0 &&
      matched.every((entry) => entry.withinTolerance),
    tolerancePence,
    matched,
    missingInNew,
    missingInLegacy,
  };
}

export function parseLegacyPayExportFile(raw: string): LegacyPayExportFile {
  const parsed = JSON.parse(raw) as LegacyPayExportFile;
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error("Invalid legacy pay export — expected { entries: [...] }");
  }
  return parsed;
}
