/** Bills reporting aggregations (legacy api/bills/reporting, Y4.1). Amounts in pence. */

export interface BillEntitySummary {
  totalCount: number;
  totalPence: number;
  paidCount: number;
  paidPence: number;
  unpaidCount: number;
  unpaidPence: number;
}

export interface BillsByMonthRow {
  year: number;
  month: number;
  entityName: string;
  totalPence: number;
  count: number;
  paidCount: number;
  paidPence: number;
  unpaidPence: number;
}

export interface LabByDentistRow {
  dentistName: string;
  labName: string;
  totalPence: number;
  count: number;
}

export interface MonthlyCostTotal {
  year: number;
  month: number;
  labTotalPence: number;
  supplierTotalPence: number;
}

export interface DentistPayRow {
  year: number;
  month: number;
  periodStatus: string;
  dentistName: string;
  finalPayPence: number;
}

export interface LabAnomaly {
  label: string;
  valuePence: number;
  diffPence: number;
  isHigh: boolean;
}

export interface UnpaidByEntityRow {
  name: string;
  amountPence: number;
}

export interface DentistPayTableRow {
  year: number;
  month: number;
  isDraft: boolean;
  values: Record<string, number>;
  totalPence: number;
}

export interface BillsReportingPayload {
  labSummary: BillEntitySummary;
  supplierSummary: BillEntitySummary;
  labByMonth: BillsByMonthRow[];
  supplierByMonth: BillsByMonthRow[];
  labByDentist: LabByDentistRow[];
  monthlyTotals: MonthlyCostTotal[];
  dentistPay: DentistPayRow[];
  labAnomalies: LabAnomaly[];
  avgMonthlyLabPence: number;
  labUnpaidByEntity: UnpaidByEntityRow[];
  supplierUnpaidByEntity: UnpaidByEntityRow[];
  dentistPayTable: DentistPayTableRow[];
  dentistNames: string[];
  dentistPayGrandTotals: {
    byDentistPence: Record<string, number>;
    totalPence: number;
  };
}

export interface LabBillReportingInput {
  labName: string | null;
  amountPence: number;
  paid: boolean;
  billDate: Date | null;
  createdAt: Date;
  dentistName: string | null;
}

export interface SupplierInvoiceReportingInput {
  supplierName: string | null;
  amountPence: number;
  paid: boolean;
  invoiceDate: Date | null;
  createdAt: Date;
}

export interface PayPeriodReportingInput {
  periodStart: Date;
  status: string;
  payslipEntries: Array<{
    dentistName: string;
    finalPayPence: number | null;
  }>;
}

export function effectiveBillDate(billDate: Date | null, createdAt: Date): Date {
  return billDate ?? createdAt;
}

export function yearMonthKey(date: Date): { year: number; month: number } {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function monthShortLabel(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

export function summarizeBills(
  items: Array<{ amountPence: number; paid: boolean }>
): BillEntitySummary {
  const totalPence = items.reduce((sum, item) => sum + item.amountPence, 0);
  const paidItems = items.filter((item) => item.paid);
  const paidPence = paidItems.reduce((sum, item) => sum + item.amountPence, 0);
  const unpaidItems = items.filter((item) => !item.paid);
  return {
    totalCount: items.length,
    totalPence,
    paidCount: paidItems.length,
    paidPence,
    unpaidCount: unpaidItems.length,
    unpaidPence: unpaidItems.reduce((sum, item) => sum + item.amountPence, 0),
  };
}

export function aggregateLabByMonth(labBills: LabBillReportingInput[]): BillsByMonthRow[] {
  const map = new Map<string, BillsByMonthRow>();
  for (const bill of labBills) {
    const date = effectiveBillDate(bill.billDate, bill.createdAt);
    const { year, month } = yearMonthKey(date);
    const entityName = bill.labName?.trim() || "Unknown";
    const key = `${year}-${month}-${entityName}`;
    const row = map.get(key) ?? {
      year,
      month,
      entityName,
      totalPence: 0,
      count: 0,
      paidCount: 0,
      paidPence: 0,
      unpaidPence: 0,
    };
    row.totalPence += bill.amountPence;
    row.count += 1;
    if (bill.paid) {
      row.paidCount += 1;
      row.paidPence += bill.amountPence;
    } else {
      row.unpaidPence += bill.amountPence;
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month || a.entityName.localeCompare(b.entityName));
}

export function aggregateSupplierByMonth(invoices: SupplierInvoiceReportingInput[]): BillsByMonthRow[] {
  const map = new Map<string, BillsByMonthRow>();
  for (const invoice of invoices) {
    const date = effectiveBillDate(invoice.invoiceDate, invoice.createdAt);
    const { year, month } = yearMonthKey(date);
    const entityName = invoice.supplierName?.trim() || "Unknown";
    const key = `${year}-${month}-${entityName}`;
    const row = map.get(key) ?? {
      year,
      month,
      entityName,
      totalPence: 0,
      count: 0,
      paidCount: 0,
      paidPence: 0,
      unpaidPence: 0,
    };
    row.totalPence += invoice.amountPence;
    row.count += 1;
    if (invoice.paid) {
      row.paidCount += 1;
      row.paidPence += invoice.amountPence;
    } else {
      row.unpaidPence += invoice.amountPence;
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month || a.entityName.localeCompare(b.entityName));
}

export function aggregateLabByDentist(labBills: LabBillReportingInput[]): LabByDentistRow[] {
  const map = new Map<string, LabByDentistRow>();
  for (const bill of labBills) {
    const dentistName = bill.dentistName?.trim() || "Unassigned";
    const labName = bill.labName?.trim() || "Unknown";
    const key = `${dentistName}::${labName}`;
    const row = map.get(key) ?? { dentistName, labName, totalPence: 0, count: 0 };
    row.totalPence += bill.amountPence;
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.dentistName.localeCompare(b.dentistName) || a.labName.localeCompare(b.labName));
}

export function buildMonthlyCostTotals(
  labByMonth: BillsByMonthRow[],
  supplierByMonth: BillsByMonthRow[]
): MonthlyCostTotal[] {
  const map = new Map<string, MonthlyCostTotal>();
  for (const row of labByMonth) {
    const key = `${row.year}-${row.month}`;
    const entry = map.get(key) ?? { year: row.year, month: row.month, labTotalPence: 0, supplierTotalPence: 0 };
    entry.labTotalPence += row.totalPence;
    map.set(key, entry);
  }
  for (const row of supplierByMonth) {
    const key = `${row.year}-${row.month}`;
    const entry = map.get(key) ?? { year: row.year, month: row.month, labTotalPence: 0, supplierTotalPence: 0 };
    entry.supplierTotalPence += row.totalPence;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

export function buildDentistPayRows(periods: PayPeriodReportingInput[]): DentistPayRow[] {
  const rows: DentistPayRow[] = [];
  for (const period of periods) {
    const { year, month } = yearMonthKey(period.periodStart);
    for (const entry of period.payslipEntries) {
      rows.push({
        year,
        month,
        periodStatus: period.status,
        dentistName: entry.dentistName,
        finalPayPence: entry.finalPayPence ?? 0,
      });
    }
  }
  return rows.sort((a, b) => a.year - b.year || a.month - b.month || a.dentistName.localeCompare(b.dentistName));
}

export function detectLabAnomalies(labByMonth: BillsByMonthRow[]): {
  anomalies: LabAnomaly[];
  avgMonthlyLabPence: number;
} {
  const monthlyTotals = new Map<string, number>();
  for (const row of labByMonth) {
    const key = `${row.year}-${row.month}`;
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + row.totalPence);
  }
  const values = [...monthlyTotals.values()];
  const avgMonthlyLabPence =
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const stdDev =
    values.length > 1
      ? Math.sqrt(values.reduce((sum, value) => sum + (value - avgMonthlyLabPence) ** 2, 0) / values.length)
      : 0;

  const anomalies: LabAnomaly[] = [];
  for (const [key, valuePence] of monthlyTotals.entries()) {
    if (Math.abs(valuePence - avgMonthlyLabPence) <= stdDev * 1.5) continue;
    const [yearStr, monthStr] = key.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    const diffPence = valuePence - avgMonthlyLabPence;
    anomalies.push({
      label: `${monthShortLabel(month)} ${year}`,
      valuePence,
      diffPence,
      isHigh: diffPence > 0,
    });
  }
  return { anomalies, avgMonthlyLabPence };
}

export function unpaidByEntity(rows: BillsByMonthRow[]): UnpaidByEntityRow[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.unpaidPence <= 0) continue;
    map.set(row.entityName, (map.get(row.entityName) ?? 0) + row.unpaidPence);
  }
  return [...map.entries()]
    .map(([name, amountPence]) => ({ name, amountPence }))
    .sort((a, b) => b.amountPence - a.amountPence);
}

export function buildDentistPayTable(dentistPay: DentistPayRow[]): {
  dentistNames: string[];
  rows: DentistPayTableRow[];
} {
  const dentistNames = [...new Set(dentistPay.map((row) => row.dentistName))].sort();
  const periodKeys = [...new Set(dentistPay.map((row) => `${row.year}-${row.month}`))].sort();

  const rows = periodKeys.map((key) => {
    const parts = key.split("-").map(Number);
    const year = parts[0] ?? 0;
    const month = parts[1] ?? 0;
    const monthEntries = dentistPay.filter((row) => row.year === year && row.month === month);
    const values: Record<string, number> = {};
    for (const entry of monthEntries) {
      values[entry.dentistName] = Math.max(0, entry.finalPayPence);
    }
    const totalPence = Object.values(values).reduce((sum, value) => sum + value, 0);
    return {
      year,
      month,
      isDraft: monthEntries.some((entry) => entry.periodStatus !== "LOCKED"),
      values,
      totalPence,
    };
  });

  return { dentistNames, rows };
}

export function computeDentistPayGrandTotals(rows: DentistPayTableRow[], dentistNames: string[]): {
  byDentistPence: Record<string, number>;
  totalPence: number;
} {
  const byDentistPence: Record<string, number> = {};
  for (const name of dentistNames) {
    byDentistPence[name] = rows.reduce((sum, row) => sum + (row.values[name] ?? 0), 0);
  }
  const totalPence = rows.reduce((sum, row) => sum + row.totalPence, 0);
  return { byDentistPence, totalPence };
}

export function buildBillsReportingPayload(input: {
  labBills: LabBillReportingInput[];
  supplierInvoices: SupplierInvoiceReportingInput[];
  periods: PayPeriodReportingInput[];
}): BillsReportingPayload {
  const labByMonth = aggregateLabByMonth(input.labBills);
  const supplierByMonth = aggregateSupplierByMonth(input.supplierInvoices);
  const { anomalies, avgMonthlyLabPence } = detectLabAnomalies(labByMonth);
  const dentistPay = buildDentistPayRows(input.periods);
  const { dentistNames, rows: dentistPayTable } = buildDentistPayTable(dentistPay);

  return {
    labSummary: summarizeBills(input.labBills),
    supplierSummary: summarizeBills(input.supplierInvoices),
    labByMonth,
    supplierByMonth,
    labByDentist: aggregateLabByDentist(input.labBills),
    monthlyTotals: buildMonthlyCostTotals(labByMonth, supplierByMonth),
    dentistPay,
    labAnomalies: anomalies,
    avgMonthlyLabPence,
    labUnpaidByEntity: unpaidByEntity(labByMonth),
    supplierUnpaidByEntity: unpaidByEntity(supplierByMonth),
    dentistPayTable,
    dentistNames,
    dentistPayGrandTotals: computeDentistPayGrandTotals(dentistPayTable, dentistNames),
  };
}
