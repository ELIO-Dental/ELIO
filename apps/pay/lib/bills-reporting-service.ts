import { scopedDb } from "@elio/db";
import { buildBillsReportingPayload } from "./bills-reporting";

/** Loads lab/supplier/pay aggregates for the reporting page (Y4.1). */
export async function getBillsReportingData(practiceId: string) {
  const db = scopedDb(practiceId);
  const [labBills, supplierInvoices, periods] = await Promise.all([
    db.labBillEntry.findMany({
      include: { dentist: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.supplierInvoiceEntry.findMany({
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.payPeriod.findMany({
      orderBy: { periodStart: "asc" },
      include: {
        payslipEntries: {
          include: { dentist: { select: { name: true } } },
        },
      },
    }),
  ]);

  return buildBillsReportingPayload({
    labBills: labBills.map((bill) => ({
      labName: bill.labName,
      amountPence: bill.amountPence,
      paid: bill.paid,
      billDate: bill.billDate,
      createdAt: bill.createdAt,
      dentistName: bill.dentist?.name ?? null,
    })),
    supplierInvoices: supplierInvoices.map((invoice) => ({
      supplierName: invoice.supplier?.name ?? null,
      amountPence: invoice.amountPence,
      paid: invoice.paid,
      invoiceDate: invoice.invoiceDate,
      createdAt: invoice.createdAt,
    })),
    periods: periods.map((period) => ({
      periodStart: period.periodStart,
      status: period.status,
      payslipEntries: period.payslipEntries.map((entry) => ({
        dentistName: entry.dentist.name,
        finalPayPence: entry.finalPayPence,
      })),
    })),
  });
}
