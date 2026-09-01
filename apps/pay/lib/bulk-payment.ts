/** Bulk payment helpers — unpaid bills, mark paid, Starling CSV (legacy Y3.4). */

import { scopedDb } from "@elio/db";

export interface UnpaidBillRow {
  id: string;
  entity_name: string;
  type: "lab" | "supplier";
  amount: number;
  amountPence: number;
  date: string;
  description: string | null;
  account_name: string | null;
  sort_code: string | null;
  account_number: string | null;
}

export interface StarlingPaymentInput {
  account_name?: string;
  entity_name: string;
  sort_code?: string;
  account_number?: string;
  amount: number;
  reference?: string;
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().substring(0, 10);
}

function bankFromEntity(entity: {
  accountName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  name: string;
}) {
  return {
    account_name: entity.accountName ?? entity.name,
    sort_code: entity.sortCode ?? "",
    account_number: entity.accountNumber ?? "",
  };
}

export async function listUnpaidBillsForBulkPayment(practiceId: string) {
  const db = scopedDb(practiceId);
  const [labBills, supplierInvoices, savedLabs, savedSuppliers] = await Promise.all([
    db.labBillEntry.findMany({
      where: { paid: false },
      include: { savedLab: true },
      orderBy: [{ labName: "asc" }, { billDate: "asc" }],
    }),
    db.supplierInvoiceEntry.findMany({
      where: { paid: false },
      include: { supplier: true },
      orderBy: [{ createdAt: "asc" }],
    }),
    db.savedLab.findMany(),
    db.savedSupplier.findMany(),
  ]);

  const labByName = new Map(savedLabs.map((lab) => [lab.name, lab]));

  const labRows: UnpaidBillRow[] = labBills.map((bill) => {
    const saved = bill.savedLab ?? (bill.labName ? labByName.get(bill.labName) : undefined);
    const bank = saved
      ? bankFromEntity(saved)
      : { account_name: bill.labName ?? "", sort_code: "", account_number: "" };
    const date = bill.billDate ?? bill.createdAt;
    return {
      id: bill.id,
      entity_name: bill.labName ?? "Unknown",
      type: "lab",
      amountPence: bill.amountPence,
      amount: bill.amountPence / 100,
      date: formatDate(date),
      description: bill.description,
      ...bank,
    };
  });

  const supplierRows: UnpaidBillRow[] = supplierInvoices.map((invoice) => {
    const supplier = invoice.supplier;
    const bank = supplier
      ? bankFromEntity(supplier)
      : { account_name: "", sort_code: "", account_number: "" };
    const date = invoice.invoiceDate ?? invoice.createdAt;
    return {
      id: invoice.id,
      entity_name: supplier?.name ?? "Unknown",
      type: "supplier",
      amountPence: invoice.amountPence,
      amount: invoice.amountPence / 100,
      date: formatDate(date),
      description: invoice.description,
      ...bank,
    };
  });

  return { lab_bills: labRows, supplier_invoices: supplierRows };
}

export async function markBillsPaid(
  practiceId: string,
  type: "lab" | "supplier",
  ids: string[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = scopedDb(practiceId);
  const paidAt = new Date();

  if (type === "lab") {
    const result = await db.labBillEntry.updateMany({
      where: { practiceId, id: { in: ids }, paid: false },
      data: { paid: true, paidAt },
    });
    return result.count;
  }

  const result = await db.supplierInvoiceEntry.updateMany({
    where: { practiceId, id: { in: ids }, paid: false },
    data: { paid: true, paidAt },
  });
  return result.count;
}

export function aggregateStarlingPayments(bills: UnpaidBillRow[]): StarlingPaymentInput[] {
  const grouped = new Map<string, StarlingPaymentInput>();

  for (const bill of bills) {
    const key = bill.entity_name;
    const existing = grouped.get(key);
    if (existing) {
      existing.amount += bill.amount;
    } else {
      grouped.set(key, {
        account_name: bill.account_name || bill.entity_name,
        entity_name: bill.entity_name,
        sort_code: bill.sort_code || "",
        account_number: bill.account_number || "",
        amount: bill.amount,
        reference: bill.entity_name,
      });
    }
  }

  return Array.from(grouped.values());
}

export function generateStarlingCsv(payments: StarlingPaymentInput[]): string {
  const rows = ["Payee Name,Sort Code,Account Number,Amount,Reference"];
  for (const payment of payments) {
    const sortCode = (payment.sort_code || "").replace(/-/g, "");
    const accountName = payment.account_name || payment.entity_name;
    const amount = payment.amount.toFixed(2);
    const reference = payment.reference || payment.entity_name;
    rows.push(
      `"${accountName}","${sortCode}","${payment.account_number || ""}","${amount}","${reference}"`
    );
  }
  return rows.join("\n");
}
