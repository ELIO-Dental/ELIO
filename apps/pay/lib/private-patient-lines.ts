import { scopedDb } from "@elio/db";
import { savePayslipEntry } from "./pay-service";
import { resolveLineItemIdByIndex, totalsFromLines } from "./private-patient-line-utils";

export { resolveLineItemIdByIndex, totalsFromLines } from "./private-patient-line-utils";

export type PrivatePatientLineUpdates = {
  paymentStatus?: "paid" | "partial" | "unpaid";
  isFinance?: boolean;
  financeFeePence?: number;
  amountPence?: number;
  flagged?: boolean;
  flagReason?: string | null;
};

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

function applyLineUpdates(
  line: {
    amountPence: number;
    amountPaidPence: number | null;
    amountOutstandingPence: number | null;
    paymentStatus: string | null;
    isFinance: boolean;
    financeFeePence: number | null;
    flagged: boolean;
    flagReason: string | null;
  },
  updates: PrivatePatientLineUpdates
) {
  if (updates.amountPence !== undefined) {
    line.amountPence = updates.amountPence;
    if (line.paymentStatus === "paid") {
      line.amountPaidPence = updates.amountPence;
      line.amountOutstandingPence = 0;
    } else if (line.paymentStatus === "unpaid") {
      line.amountPaidPence = 0;
      line.amountOutstandingPence = updates.amountPence;
    } else if (line.paymentStatus === "partial" && line.amountPaidPence != null) {
      line.amountOutstandingPence = Math.max(0, updates.amountPence - line.amountPaidPence);
    }
  }

  if (updates.paymentStatus !== undefined) {
    line.paymentStatus = updates.paymentStatus;
    if (updates.paymentStatus === "paid") {
      line.amountPaidPence = line.amountPence;
      line.amountOutstandingPence = 0;
      line.flagged = line.isFinance;
      if (!line.isFinance) line.flagReason = null;
    } else if (updates.paymentStatus === "unpaid") {
      line.amountPaidPence = 0;
      line.amountOutstandingPence = line.amountPence;
      line.flagged = true;
      line.flagReason = "Invoice not paid";
    }
  }

  if (updates.isFinance !== undefined) {
    line.isFinance = updates.isFinance;
    if (updates.isFinance && line.paymentStatus === "paid") {
      line.flagged = true;
      line.flagReason = "Paid via finance - verify fee deduction";
    }
  }

  if (updates.financeFeePence !== undefined) {
    line.financeFeePence = updates.financeFeePence;
  }

  if (updates.flagged !== undefined) {
    line.flagged = updates.flagged;
    if (updates.flagged === false) line.flagReason = null;
  }

  if (updates.flagReason !== undefined) {
    line.flagReason = updates.flagReason;
  }
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
  applyLineUpdates(draft, updates);

  await db.privateRevenueLineItem.update({
    where: { id: lineItemId },
    data: {
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
  return { line: draft, totals, payslip: payslipAfter };
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

  const refreshedLines = [
    ...payslip.privateRevenueLineItems.map((li) => ({
      amountPaidPence: li.amountPaidPence,
      isFinance: li.isFinance,
      financeFeePence: li.financeFeePence,
    })),
    { amountPaidPence: line.amountPaidPence, isFinance: line.isFinance, financeFeePence: line.financeFeePence },
  ];

  const payslipAfter = await recalcPayslipTotals(practiceId, payPeriodId, payslipEntryId, refreshedLines);
  return { line, totals: totalsFromLines(refreshedLines), payslip: payslipAfter };
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
  return { removed: line, totals: totalsFromLines(refreshedLines), payslip: payslipAfter };
}
