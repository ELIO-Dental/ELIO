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
  financeFees: number;
  therapyMinutes: number;
  therapyRate: number;
  superannuationDeduction: number;
  patientCount: number;
  labBillTotal: number;
  adjustmentsTotal: number;
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

export function legacyPayslipSummary(row: LegacyPayslipRow): LegacyPayslipSummary {
  const patients = legacyPayslipPatients(row);
  const labBills = legacyPayslipLabBills(row);
  const adjustments = legacyPayslipAdjustments(row);

  let adjustmentsTotal = 0;
  for (const adj of adjustments) {
    const amount = Number(adj.amount) || 0;
    adjustmentsTotal += adj.type === "deduction" ? -amount : amount;
  }

  return {
    sourceId: String(row.id ?? ""),
    grossPrivate: Number(row.gross_private) || 0,
    nhsUdas: Number(row.nhs_udas) || 0,
    financeFees: Number(row.finance_fees) || 0,
    therapyMinutes: Number(row.therapy_minutes) || 0,
    therapyRate: Number(row.therapy_rate) || 0.5833,
    superannuationDeduction: Number(row.superannuation_deduction) || 0,
    patientCount: patients.length,
    labBillTotal: labBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
    adjustmentsTotal: Math.round(adjustmentsTotal * 100) / 100,
    notes: row.notes ?? "",
  };
}

export function formatLegacyPeriodLabel(month: number, year: number): string {
  if (!month || !year) return "Unknown period";
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
