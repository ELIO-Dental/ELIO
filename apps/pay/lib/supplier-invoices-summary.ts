/** Supplier invoice summary + filter helpers (AuraPay parity with lab bills). */

export interface SupplierInvoiceListItem {
  id: string;
  supplierId: string | null;
  supplierName: string | null;
  dentistId: string | null;
  dentistName: string | null;
  amountPence: number;
  description: string | null;
  invoiceNumber: string | null;
  fileUrl: string | null;
  invoiceDate: string | null;
  paid: boolean;
  paidAt: string | null;
  createdAt: string;
}

export type SupplierPayFilter = "all" | "paid" | "unpaid";

export function supplierInvoiceEffectiveDate(
  invoice: Pick<SupplierInvoiceListItem, "invoiceDate" | "createdAt">
): Date {
  return new Date(invoice.invoiceDate ?? invoice.createdAt);
}

export function filterSupplierInvoices(
  invoices: SupplierInvoiceListItem[],
  filters: {
    payFilter?: SupplierPayFilter;
    supplierName?: string;
    dentistId?: string;
    search?: string;
    year?: number;
    month?: number | null;
  }
): SupplierInvoiceListItem[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  return invoices.filter((invoice) => {
    if (filters.payFilter === "paid" && !invoice.paid) return false;
    if (filters.payFilter === "unpaid" && invoice.paid) return false;
    if (filters.supplierName && (invoice.supplierName ?? "") !== filters.supplierName) return false;
    if (filters.dentistId && invoice.dentistId !== filters.dentistId) return false;

    const date = supplierInvoiceEffectiveDate(invoice);
    if (filters.year && date.getUTCFullYear() !== filters.year) return false;
    if (filters.month && date.getUTCMonth() + 1 !== filters.month) return false;

    if (search) {
      const haystack = [invoice.supplierName, invoice.dentistName, invoice.description, invoice.invoiceNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function summarizeSupplierInvoices(invoices: SupplierInvoiceListItem[]) {
  const totalPence = invoices.reduce((sum, invoice) => sum + invoice.amountPence, 0);
  const paidPence = invoices
    .filter((invoice) => invoice.paid)
    .reduce((sum, invoice) => sum + invoice.amountPence, 0);
  const unpaidCount = invoices.filter((invoice) => !invoice.paid).length;
  return {
    totalPence,
    paidPence,
    unpaidPence: totalPence - paidPence,
    count: invoices.length,
    unpaidCount,
  };
}

export interface SupplierInvoiceMatrixCell {
  totalPence: number;
  allPaid: boolean;
}

export function buildSupplierInvoiceMatrix(invoices: SupplierInvoiceListItem[]) {
  const supplierNames = [
    ...new Set(invoices.map((invoice) => invoice.supplierName ?? "Unknown")),
  ].sort();
  const monthKeys = [
    ...new Set(
      invoices.map((invoice) => {
        const date = supplierInvoiceEffectiveDate(invoice);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      })
    ),
  ].sort();

  const lookup = new Map<string, Map<string, SupplierInvoiceMatrixCell>>();
  for (const invoice of invoices) {
    const date = supplierInvoiceEffectiveDate(invoice);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    const supplierName = invoice.supplierName ?? "Unknown";
    if (!lookup.has(monthKey)) lookup.set(monthKey, new Map());
    const row = lookup.get(monthKey)!;
    const existing = row.get(supplierName) ?? { totalPence: 0, allPaid: true };
    existing.totalPence += invoice.amountPence;
    if (!invoice.paid) existing.allPaid = false;
    row.set(supplierName, existing);
  }

  const columnTotals = new Map<string, number>();
  for (const supplierName of supplierNames) {
    let total = 0;
    for (const monthKey of monthKeys) {
      total += lookup.get(monthKey)?.get(supplierName)?.totalPence ?? 0;
    }
    columnTotals.set(supplierName, total);
  }

  return { supplierNames, monthKeys, lookup, columnTotals };
}

export function formatSupplierInvoiceMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
