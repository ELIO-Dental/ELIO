import { scopedDb } from "@elio/db";
import { savePayslipEntry } from "./pay-service";
import {
  applyPrivatePatientLineUpdates,
  legacyTotalsFromPence,
  patientIndexForLineId,
  resolveLineItemIdByIndex,
  totalsFromLines,
  type PrivatePatientLineUpdates,
} from "./private-patient-line-utils";

export {
  applyPrivatePatientLineUpdates,
  legacyTotalsFromPence,
  patientIndexForLineId,
  resolveLineItemIdByIndex,
  totalsFromLines,
  type PrivatePatientLineUpdates,
} from "./private-patient-line-utils";

function assertDraftPeriod(status: string) {
  if (status === "LOCKED") throw new Error("Pay period is locked");
}

async function loadLineContext(practiceId: string, payPeriodId: string, payslipEntryId: string, lineItemId: string) {
  const db = scopedDb(practiceId);
  const payslip = await db.payslipEntry.findFirst({
    where: { id: payslipEntryId, payPeriodId, practiceId },
    include: { payPeriod: true, privateRevenueLineItems: { orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }] } },
  });
  if (!payslip) throw new Error("Payslip not found");
  assertDraftPeriod(payslip.payPeriod.status);

  const line = payslip.privateRevenueLineItems.find((li) => li.id === lineItemId);
  if (!line) throw new Error("Patient line not found");
  return { db, payslip, line };
}

async function recalcPayslipTotals(practiceId: string, payPeriodId: string, payslipEntryId: string, lines: Array<{ amountPaidPence?: number | null; isFinance: boolean; financeFeePence?: number | null }>) {
  const { grossPrivateRevenuePence, financeFeesPence } = totalsFromLines(lines);
  return savePayslipEntry(practiceId, payPeriodId, {
    payslipEntryId,
    grossPrivateRevenuePence,
    financeFeesPence,
  });
}

/** Update one private patient row (legacy PUT /periods/patients, Y2.1b). */
export async function updatePrivatePatientLine(
  practiceId: string,
  payPeriodId: string,
  payslipEntryId: string,
  lineItemId: string,
  updates: PrivatePatientLineUpdates
) {
  const { db, payslip, line } = await loadLineContext(practiceId, payPeriodId, payslipEntryId, lineItemId);
  const draft = { ...line };
  applyPrivatePatientLineUpdates(draft, updates);

  await db.privateRevenueLineItem.update({
    where: { id: lineItemId },
    data: {
      patientName: updates.patientName ?? line.patientName,
      invoiceDate: updates.invoiceDate ?? line.invoiceDate,
      amountPence: draft.amountPence,
      amountPaidPence: draft.amountPaidPence,
      amountOutstandingPence: draft.amountOutstandingPence,
      paymentStatus: draft.paymentStatus,
      isFinance: draft.isFinance,
      financeFeePence: draft.financeFeePence,
      flagged: draft.flagged,
      flagReason: draft.flagReason,
    },
  });

  const refreshedLines = payslip.privateRevenueLineItems.map((li) =>
    li.id === lineItemId
      ? {
          amountPaidPence: draft.amountPaidPence,
          isFinance: draft.isFinance,
          financeFeePence: draft.financeFeePence,
        }
      : {
          amountPaidPence: li.amountPaidPence,
          isFinance: li.isFinance,
          financeFeePence: li.financeFeePence,
        }
  );

  const payslipAfter = await recalcPayslipTotals(practiceId, payPeriodId, payslipEntryId, refreshedLines);
  const totals = totalsFromLines(refreshedLines);
  return {
    patient: draft,
    totals: legacyTotalsFromPence(totals),
    payslip: payslipAfter,
    patientIndex: patientIndexForLineId(payslip.privateRevenueLineItems, lineItemId),
  };
}

export type ManualPrivatePatientInput = {
  patientName?: string;
  invoiceDate?: string;
  amountPence: number;
  paymentStatus?: "paid" | "partial" | "unpaid";
  isFinance?: boolean;
  financeFeePence?: number;
};

/** Add a manual private patient row (legacy POST /periods/patients, Y2.1b). */
export async function addManualPrivatePatientLine(
  practiceId: string,
  payPeriodId: string,
  payslipEntryId: string,
  patient: ManualPrivatePatientInput
) {
  const db = scopedDb(practiceId);
  const payslip = await db.payslipEntry.findFirst({
    where: { id: payslipEntryId, payPeriodId, practiceId },
    include: { payPeriod: true, privateRevenueLineItems: true },
  });
  if (!payslip) throw new Error("Payslip not found");
  assertDraftPeriod(payslip.payPeriod.status);

  const status = patient.paymentStatus ?? "paid";
  const amountPence = patient.amountPence;
  const isFinance = patient.isFinance ?? false;
  const amountPaidPence = status === "paid" ? amountPence : status === "unpaid" ? 0 : Math.round(amountPence / 2);
  const amountOutstandingPence = status === "paid" ? 0 : amountPence - amountPaidPence;

  const line = await db.privateRevenueLineItem.create({
    data: {
      payslipEntryId,
      patientName: patient.patientName ?? "Manual Entry",
      invoiceDate: patient.invoiceDate ?? new Date().toISOString().slice(0, 10),
      dentallyInvoiceId: `manual-${Date.now()}`,
      dentallyPatientId: `manual-${Date.now()}`,
      amountPence,
      amountPaidPence,
      amountOutstandingPence,
      paymentStatus: status,
      isFinance,
      financeFeePence: patient.financeFeePence ?? null,
      flagged: isFinance || status !== "paid",
      flagReason: status !== "paid" ? "Invoice not paid" : isFinance ? "Paid via finance - verify fee deduction" : null,
    },
  });

  const allLines = [...payslip.privateRevenueLineItems, line];
  const refreshedLines = allLines.map((li) => ({
    amountPaidPence: li.amountPaidPence,
    isFinance: li.isFinance,
    financeFeePence: li.financeFeePence,
  }));

  const payslipAfter = await recalcPayslipTotals(practiceId, payPeriodId, payslipEntryId, refreshedLines);
  const totals = totalsFromLines(refreshedLines);
  return {
    patient: line,
    patientIndex: patientIndexForLineId(allLines, line.id),
    totals: legacyTotalsFromPence(totals),
    payslip: payslipAfter,
  };
}

/** Delete a private patient row (legacy DELETE /periods/patients, Y2.1b). */
export async function deletePrivatePatientLine(
  practiceId: string,
  payPeriodId: string,
  payslipEntryId: string,
  lineItemId: string
) {
  const { db, payslip, line } = await loadLineContext(practiceId, payPeriodId, payslipEntryId, lineItemId);
  await db.privateRevenueLineItem.delete({ where: { id: lineItemId } });

  const refreshedLines = payslip.privateRevenueLineItems
    .filter((li) => li.id !== lineItemId)
    .map((li) => ({
      amountPaidPence: li.amountPaidPence,
      isFinance: li.isFinance,
      financeFeePence: li.financeFeePence,
    }));

  const payslipAfter = await recalcPayslipTotals(practiceId, payPeriodId, payslipEntryId, refreshedLines);
  const totals = totalsFromLines(refreshedLines);
  return { removed: line, totals: legacyTotalsFromPence(totals), payslip: payslipAfter };
}
