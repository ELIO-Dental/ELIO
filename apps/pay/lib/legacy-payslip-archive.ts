/** Parse migrated AuraPay payslip row JSON (Y2.10 read-only archive). */

export interface LegacyPrivatePatient {
  name?: string;
  patientName?: string;
  date?: string;
  amount?: number;
  amountPaid?: number;
  amountOutstanding?: number;
  treatment?: string;
  status?: string;
  finance?: boolean;
  financeFee?: number;
  durationMins?: number;
  hourlyRate?: number;
  flagged?: boolean;
  flagReason?: string;
  resolved?: boolean;
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

export interface LegacyDiscrepancy {
  type?: string;
  patientName?: string;
  invoicedAmount?: number;
  paidAmount?: number;
  logAmount?: number;
  date?: string;
  notes?: string;
  resolved?: boolean;
}

export interface LegacyDentistLogEntry {
  patientName?: string;
  date?: string;
  amount?: number;
  treatment?: string;
}

export interface LegacyAnalytics {
  totalChairMins?: number;
  totalPatients?: number;
  grossPerHour?: number;
  netPerHour?: number;
  avgAppointmentMins?: number;
  utilizationPercent?: number;
  topPatientsByHourlyRate?: Array<{
    name?: string;
    amount?: number;
    durationMins?: number;
    hourlyRate?: number;
  }>;
  topTreatmentsByHourlyRate?: Array<{
    treatment?: string;
    totalAmount?: number;
    totalMins?: number;
    hourlyRate?: number;
    count?: number;
  }>;
}

export interface LegacyTherapyBreakdownItem {
  patientName?: string;
  patientId?: string;
  date?: string;
  minutes?: number;
  treatment?: string;
  therapistName?: string;
  cost?: number;
}

export interface LegacyNhsPeriod {
  start?: string;
  end?: string;
  nhs_period_start?: string;
  nhs_period_end?: string;
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
  therapy_breakdown_json?: string;
  nhs_period_json?: string;
}

export interface LegacyPayslipSummary {
  sourceId: string;
  grossPrivate: number;
  netPrivate: number;
  splitPercent: number;
  udaRate: number;
  nhsUdas: number;
  nhsIncome: number;
  financeFees: number;
  financeFeesDeduction: number;
  therapyMinutes: number;
  therapyRate: number;
  therapyDeduction: number;
  superannuationDeduction: number;
  patientCount: number;
  labBillTotal: number;
  labBillsDeduction: number;
  adjustmentsTotal: number;
  totalDeductions: number;
  totalEarnings: number;
  /** AuraPay net pay (GBP) using split/UDA rate when known. */
  netPay: number;
  notes: string;
  labBillSplit: number;
  financeFeeSplit: number;
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

function parseJsonObject<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    return null;
  } catch {
    return null;
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

export function legacyPayslipDiscrepancies(row: LegacyPayslipRow): LegacyDiscrepancy[] {
  return parseJsonArray<LegacyDiscrepancy>(row.discrepancies_json);
}

export function legacyPayslipDentistLog(row: LegacyPayslipRow): LegacyDentistLogEntry[] {
  return parseJsonArray<LegacyDentistLogEntry>(row.dentist_log_json);
}

export function legacyPayslipTherapyBreakdown(row: LegacyPayslipRow): LegacyTherapyBreakdownItem[] {
  return parseJsonArray<LegacyTherapyBreakdownItem>(row.therapy_breakdown_json);
}

export function legacyPayslipAnalytics(row: LegacyPayslipRow): LegacyAnalytics | null {
  return parseJsonObject<LegacyAnalytics>(row.analytics_json);
}

export function legacyPayslipNhsPeriod(row: LegacyPayslipRow): LegacyNhsPeriod | null {
  return parseJsonObject<LegacyNhsPeriod>(row.nhs_period_json);
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
  const labBillSplit = opts?.labBillSplit ?? 0.5;
  const financeFeeSplit = opts?.financeFeeSplit ?? 0.5;
  const financeFees = roundCurrency(Number(row.finance_fees) || 0);
  const therapyMinutes = Math.max(0, Number(row.therapy_minutes) || 0);
  const therapyRate = Number(row.therapy_rate) > 0 ? Number(row.therapy_rate) : 0.5833;
  const therapyDeduction = roundCurrency(therapyMinutes * therapyRate);
  const superannuationDeduction = roundCurrency(Math.max(0, Number(row.superannuation_deduction) || 0));
  const labBillsDeduction = roundCurrency(labBillTotal * labBillSplit);
  const financeFeesDeduction = roundCurrency(financeFees * financeFeeSplit);
  const totalEarnings = roundCurrency(netPrivate + nhsIncome);
  const totalDeductions = roundCurrency(
    labBillsDeduction + financeFeesDeduction + therapyDeduction + superannuationDeduction
  );
  const netPay = roundCurrency(totalEarnings - totalDeductions + adjustmentsTotal);

  return {
    sourceId: String(row.id ?? ""),
    grossPrivate,
    netPrivate,
    splitPercent,
    udaRate,
    nhsUdas,
    nhsIncome,
    financeFees,
    financeFeesDeduction,
    therapyMinutes,
    therapyRate,
    therapyDeduction,
    superannuationDeduction,
    patientCount: patients.length,
    labBillTotal,
    labBillsDeduction,
    adjustmentsTotal,
    totalDeductions,
    totalEarnings,
    netPay,
    notes: row.notes ?? "",
    labBillSplit,
    financeFeeSplit,
  };
}

export function formatLegacyPeriodLabel(month: number, year: number): string {
  if (!month || !year) return "Unknown period";
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function formatLegacyDiscrepancyType(type: string | undefined): string {
  switch (type) {
    case "invoiced_not_paid":
      return "Invoiced not paid";
    case "partial_payment":
      return "Partial payment";
    case "log_mismatch":
      return "Log mismatch";
    case "in_log_not_system":
      return "In log, not system";
    case "in_system_not_log":
      return "In system, not log";
    default:
      return type || "Discrepancy";
  }
}
