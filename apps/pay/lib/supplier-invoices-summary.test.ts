import { describe, expect, it } from "vitest";
import {
  buildSupplierInvoiceMatrix,
  filterSupplierInvoices,
  summarizeSupplierInvoices,
} from "./supplier-invoices-summary";

const SAMPLE: Parameters<typeof filterSupplierInvoices>[0] = [
  {
    id: "1",
    supplierId: "s1",
    supplierName: "Acme",
    dentistId: "d1",
    dentistName: "Dr A",
    amountPence: 10000,
    description: "Gloves",
    invoiceNumber: "INV-1",
    fileUrl: null,
    invoiceDate: "2025-03-10",
    paid: false,
    paidAt: null,
    createdAt: "2025-03-10T00:00:00.000Z",
  },
  {
    id: "2",
    supplierId: "s1",
    supplierName: "Acme",
    dentistId: "d2",
    dentistName: "Dr B",
    amountPence: 5000,
    description: "Burs",
    invoiceNumber: "INV-2",
    fileUrl: null,
    invoiceDate: "2025-03-15",
    paid: true,
    paidAt: "2025-03-20T00:00:00.000Z",
    createdAt: "2025-03-15T00:00:00.000Z",
  },
  {
    id: "3",
    supplierId: "s2",
    supplierName: "Zenith",
    dentistId: "d1",
    dentistName: "Dr A",
    amountPence: 7500,
    description: "Composite",
    invoiceNumber: null,
    fileUrl: null,
    invoiceDate: "2025-04-02",
    paid: false,
    paidAt: null,
    createdAt: "2025-04-02T00:00:00.000Z",
  },
];

describe("supplier invoices summary", () => {
  it("filters by pay status and supplier name", () => {
    const unpaidAcme = filterSupplierInvoices(SAMPLE, { payFilter: "unpaid", supplierName: "Acme" });
    expect(unpaidAcme).toHaveLength(1);
    expect(unpaidAcme[0]?.id).toBe("1");
  });

  it("summarizes totals", () => {
    const summary = summarizeSupplierInvoices(SAMPLE);
    expect(summary.totalPence).toBe(22500);
    expect(summary.paidPence).toBe(5000);
    expect(summary.unpaidCount).toBe(2);
  });

  it("builds month x supplier matrix", () => {
    const matrix = buildSupplierInvoiceMatrix(SAMPLE);
    expect(matrix.supplierNames).toEqual(["Acme", "Zenith"]);
    expect(matrix.monthKeys).toEqual(["2025-03", "2025-04"]);
    expect(matrix.lookup.get("2025-03")?.get("Acme")?.totalPence).toBe(15000);
    expect(matrix.lookup.get("2025-03")?.get("Acme")?.allPaid).toBe(false);
  });
});
