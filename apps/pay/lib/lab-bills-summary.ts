/** Lab bill summary + filter helpers (legacy Y3.3). */

export interface LabBillListItem {
  id: string;
  labName: string | null;
  dentistId: string | null;
  dentistName: string | null;
  amountPence: number;
  description: string | null;
  fileUrl: string | null;
  billDate: string | null;
  paid: boolean;
  paidAt: string | null;
  createdAt: string;
}

export type LabPayFilter = "all" | "paid" | "unpaid";

export function labBillEffectiveDate(bill: Pick<LabBillListItem, "billDate" | "createdAt">): Date {
  return new Date(bill.billDate ?? bill.createdAt);
}

export function filterLabBills(
  bills: LabBillListItem[],
  filters: {
    payFilter?: LabPayFilter;
    labName?: string;
    dentistId?: string;
    search?: string;
    year?: number;
    month?: number | null;
  }
): LabBillListItem[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  return bills.filter((bill) => {
    if (filters.payFilter === "paid" && !bill.paid) return false;
    if (filters.payFilter === "unpaid" && bill.paid) return false;
    if (filters.labName && (bill.labName ?? "") !== filters.labName) return false;
    if (filters.dentistId && bill.dentistId !== filters.dentistId) return false;

    const date = labBillEffectiveDate(bill);
    if (filters.year && date.getUTCFullYear() !== filters.year) return false;
    if (filters.month && date.getUTCMonth() + 1 !== filters.month) return false;

    if (search) {
      const haystack = [bill.labName, bill.dentistName, bill.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function summarizeLabBills(bills: LabBillListItem[]) {
  const totalPence = bills.reduce((sum, bill) => sum + bill.amountPence, 0);
  const paidPence = bills.filter((bill) => bill.paid).reduce((sum, bill) => sum + bill.amountPence, 0);
  const unpaidCount = bills.filter((bill) => !bill.paid).length;
  return {
    totalPence,
    paidPence,
    unpaidPence: totalPence - paidPence,
    count: bills.length,
    unpaidCount,
  };
}

export interface LabBillMatrixCell {
  totalPence: number;
  allPaid: boolean;
}

export function buildLabBillMatrix(bills: LabBillListItem[]) {
  const labNames = [...new Set(bills.map((bill) => bill.labName ?? "Unknown"))].sort();
  const monthKeys = [
    ...new Set(
      bills.map((bill) => {
        const date = labBillEffectiveDate(bill);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      })
    ),
  ].sort();

  const lookup = new Map<string, Map<string, LabBillMatrixCell>>();
  for (const bill of bills) {
    const date = labBillEffectiveDate(bill);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const labName = bill.labName ?? "Unknown";
    if (!lookup.has(monthKey)) lookup.set(monthKey, new Map());
    const row = lookup.get(monthKey)!;
    const existing = row.get(labName) ?? { totalPence: 0, allPaid: true };
    existing.totalPence += bill.amountPence;
    if (!bill.paid) existing.allPaid = false;
    row.set(labName, existing);
  }

  const columnTotals = new Map<string, number>();
  for (const labName of labNames) {
    let total = 0;
    for (const monthKey of monthKeys) {
      total += lookup.get(monthKey)?.get(labName)?.totalPence ?? 0;
    }
    columnTotals.set(labName, total);
  }

  return { labNames, monthKeys, lookup, columnTotals };
}

export function formatLabBillMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
