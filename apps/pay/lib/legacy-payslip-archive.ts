/** Parse migrated AuraPay payslip row JSON (Y2.10 read-only archive). */

export interface LegacyPrivatePatient {
  name?: string;
  patientName?: string;
  date?: string;
  amount?: number;
  amountPaid?: number;
  treatment?: string;
  status?: string;
}

export interface LegacyLabBill {
  lab_name?: string;
  amount?: number;
  description?: string;
  file_url?: string;
}

export interface LegacyAdjustment {
  description?: string;
  amount?: number;
  type?: "addition" | "deduction";
}

export interface LegacyPayslipRow {
  id?: number | string;
  gross_private?: number;
  nhs_udas?: number;
  finance_fees?: number;
  therapy_minutes?: number;
  therapy_rate?: number;
  superannuation_deduction?: number;
  notes?: string;
  private_patients_json?: string;
  lab_bills_json?: string;
  adjustments_json?: string;
  discrepancies_json?: string;
  analytics_json?: string;
  dentist_log_json?: string;
  nhs_period_json?: string;
}

export interface LegacyPayslipSummary {
  sourceId: string;
  grossPrivate: number;
  nhsUdas: number;
  nhsIncome: number;
  financeFees: number;
  therapyMinutes: number;
  therapyRate: number;
  superannuationDeduction: number;
  patientCount: number;
  labBillTotal: number;
  adjustmentsTotal: number;
  /** Estimated AuraPay net pay (GBP) using split/UDA rate when known. */
  netPay: number;
  notes: string;
}

function parseJsonArray<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function parseLegacyPayslipRow(rawRowJson: string): LegacyPayslipRow {
  try {
    return JSON.parse(rawRowJson) as LegacyPayslipRow;
  } catch {
    return {};
  }
}

export function legacyPayslipPatients(row: LegacyPayslipRow): LegacyPrivatePatient[] {
  return parseJsonArray<LegacyPrivatePatient>(row.private_patients_json);
}

export function legacyPayslipLabBills(row: LegacyPayslipRow): LegacyLabBill[] {
  return parseJsonArray<LegacyLabBill>(row.lab_bills_json);
}

export function legacyPayslipAdjustments(row: LegacyPayslipRow): LegacyAdjustment[] {
  return parseJsonArray<LegacyAdjustment>(row.adjustments_json);
}

export function legacyPayslipSummary(
  row: LegacyPayslipRow,
  opts?: {
    splitPercent?: number | null;
    udaRate?: number | null;
    labBillSplit?: number;
    financeFeeSplit?: number;
  }
): LegacyPayslipSummary {
  const patients = legacyPayslipPatients(row);
  const labBills = legacyPayslipLabBills(row);
  const adjustments = legacyPayslipAdjustments(row);

  let adjustmentsTotal = 0;
  for (const adj of adjustments) {
    const amount = Number(adj.amount) || 0;
    adjustmentsTotal += adj.type === "deduction" ? -amount : amount;
  }
  adjustmentsTotal = roundCurrency(adjustmentsTotal);

  const grossPrivate =
    patients.length > 0
      ? roundCurrency(patients.reduce((s, p) => s + (Number(p.amount) || 0), 0))
      : roundCurrency(Number(row.gross_private) || 0);
  const splitPercent = Math.max(0, Math.min(100, opts?.splitPercent ?? 50));
  const netPrivate = roundCurrency(grossPrivate * (splitPercent / 100));
  const nhsUdas = Math.max(0, Number(row.nhs_udas) || 0);
  const udaRate = Math.max(0, opts?.udaRate ?? 0);
  const nhsIncome = roundCurrency(nhsUdas * udaRate);
  const labBillTotal = roundCurrency(labBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0));
  const labSplit = opts?.labBillSplit ?? 0.5;
  const financeSplit = opts?.financeFeeSplit ?? 0.5;
  const financeFees = roundCurrency(Number(row.finance_fees) || 0);
  const therapyMinutes = Math.max(0, Number(row.therapy_minutes) || 0);
  const therapyRate = Number(row.therapy_rate) > 0 ? Number(row.therapy_rate) : 0.5833;
  const therapyDeduction = roundCurrency(therapyMinutes * therapyRate);
  const superannuationDeduction = roundCurrency(Math.max(0, Number(row.superannuation_deduction) || 0));
  const totalEarnings = roundCurrency(netPrivate + nhsIncome);
  const totalDeductions = roundCurrency(
    labBillTotal * labSplit + financeFees * financeSplit + therapyDeduction + superannuationDeduction
  );
  const netPay = roundCurrency(totalEarnings - totalDeductions + adjustmentsTotal);

  return {
    sourceId: String(row.id ?? ""),
    grossPrivate,
    nhsUdas,
    nhsIncome,
    financeFees,
    therapyMinutes,
    therapyRate,
    superannuationDeduction,
    patientCount: patients.length,
    labBillTotal,
    adjustmentsTotal,
    netPay,
    notes: row.notes ?? "",
  };
}

export function formatLegacyPeriodLabel(month: number, year: number): string {
  if (!month || !year) return "Unknown period";
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
