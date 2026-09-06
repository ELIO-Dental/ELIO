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
import {
  isValidFinanceTerm,
  payslipIsProvisional,
  resolveFinanceFeeForLine,
  type FinanceTermMonths,
} from "./finance-fee";
import { getPaySettings } from "./pay-settings-service";
import { manualLineSourceFields } from "./line-source";

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

async function syncPayslipProvisional(
  db: ReturnType<typeof scopedDb>,
  payslipEntryId: string,
  lines: Array<{
    isFinance: boolean;
    amountPence: number;
    financeFeePence?: number | null;
    financeTermMonths?: number | null;
  }>
) {
  await db.payslipEntry.update({
    where: { id: payslipEntryId },
    data: { provisional: payslipIsProvisional(lines) },
  });
}

async function recalcPayslipTotals(
  practiceId: string,
  payPeriodId: string,
  payslipEntryId: string,
  lines: Array<{
    amountPence?: number | null;
    amountPaidPence?: number | null;
    amountOutstandingPence?: number | null;
    paymentStatus?: string | null;
    flagged?: boolean | null;
    isFinance: boolean;
    financeFeePence?: number | null;
  }>
) {
  const { grossPrivateRevenuePence, financeFeesPence } = totalsFromLines(lines);
  return savePayslipEntry(practiceId, payPeriodId, {
    payslipEntryId,
    grossPrivateRevenuePence,
    financeFeesPence,
  });
}

/** After term set with blank fee — fill suggested fee from rate table (not manual). */
async function maybeSuggestFeeFromTerm(
  practiceId: string,
  draft: {
    isFinance: boolean;
    amountPence: number;
    financeFeePence: number | null;
    financeTermMonths: number | null;
    financeFeeManual: boolean;
  },
  updates: PrivatePatientLineUpdates
) {
  if (!draft.isFinance) return;
  if (draft.financeFeeManual) return;
  if (updates.financeFeePence !== undefined && updates.financeFeePence != null) return;
  if (!isValidFinanceTerm(draft.financeTermMonths)) return;
  // Re-suggest when term changes or fee still blank.
  if (updates.financeTermMonths === undefined && draft.financeFeePence != null) return;

  const settings = await getPaySettings(practiceId);
  const resolved = resolveFinanceFeeForLine(
    {
      isFinance: true,
      amountPence: draft.amountPence,
      financeTermMonths: draft.financeTermMonths as FinanceTermMonths,
      financeFeePence: null,
      financeFeeManual: false,
    },
    settings
  );
  draft.financeFeePence = resolved.feePence;
  draft.financeFeeManual = false;
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
  const draft = {
    amountPence: line.amountPence,
    amountPaidPence: line.amountPaidPence,
    amountOutstandingPence: line.amountOutstandingPence,
    paymentStatus: line.paymentStatus,
    isFinance: line.isFinance,
    financeFeePence: line.financeFeePence,
    financeTermMonths: line.financeTermMonths,
    financeFeeManual: line.financeFeeManual,
    flagged: line.flagged,
    flagReason: line.flagReason,
  };
  applyPrivatePatientLineUpdates(draft, updates);
  await maybeSuggestFeeFromTerm(practiceId, draft, updates);

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
      financeTermMonths: draft.financeTermMonths,
      financeFeeManual: draft.financeFeeManual,
      flagged: draft.flagged,
      flagReason: draft.flagReason,
    },
  });

  const refreshedForTotals = payslip.privateRevenueLineItems.map((li) =>
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

  const refreshedForProvisional = payslip.privateRevenueLineItems.map((li) =>
    li.id === lineItemId
      ? {
          isFinance: draft.isFinance,
          amountPence: draft.amountPence,
          financeFeePence: draft.financeFeePence,
          financeTermMonths: draft.financeTermMonths,
          financeFeeManual: draft.financeFeeManual,
        }
      : {
          isFinance: li.isFinance,
          amountPence: li.amountPence,
          financeFeePence: li.financeFeePence,
          financeTermMonths: li.financeTermMonths,
          financeFeeManual: li.financeFeeManual,
        }
  );

  const payslipAfter = await recalcPayslipTotals(practiceId, payPeriodId, payslipEntryId, refreshedForTotals);
  await syncPayslipProvisional(db, payslipEntryId, refreshedForProvisional);
  const totals = totalsFromLines(refreshedForTotals);
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
  financeTermMonths?: number | null;
  /** Step 32 — required note for manual plugs. */
  note?: string | null;
  /** Step 32 — ops author. */
  actorUserId?: string;
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

  const term = isValidFinanceTerm(patient.financeTermMonths) ? patient.financeTermMonths : null;
  let financeFeePence = patient.financeFeePence ?? null;
  let financeFeeManual = financeFeePence != null;
  if (isFinance && term && financeFeePence == null) {
    const settings = await getPaySettings(practiceId);
    financeFeePence = resolveFinanceFeeForLine(
      { isFinance: true, amountPence, financeTermMonths: term, financeFeePence: null },
      settings
    ).feePence;
    financeFeeManual = false;
  }

  const line = await db.privateRevenueLineItem.create({
    data: {
      payslipEntryId,
      patientName: patient.patientName ?? "Manual Entry",
      invoiceDate: patient.invoiceDate ?? new Date().toISOString().slice(0, 10),
      dentallyInvoiceId: null,
      dentallyPatientId: null,
      ...manualLineSourceFields({
        amountPence,
        actorUserId: patient.actorUserId ?? "",
        note: patient.note,
      }),
      amountPence,
      amountPaidPence,
      amountOutstandingPence,
      paymentStatus: status,
      isFinance,
      financeFeePence,
      financeTermMonths: term,
      financeFeeManual,
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
  await syncPayslipProvisional(
    db,
    payslipEntryId,
    allLines.map((li) => ({
      isFinance: li.isFinance,
      amountPence: li.amountPence,
      financeFeePence: li.financeFeePence,
      financeTermMonths: li.financeTermMonths,
      financeFeeManual: li.financeFeeManual,
    }))
  );
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

  const remaining = payslip.privateRevenueLineItems.filter((li) => li.id !== lineItemId);
  const refreshedLines = remaining.map((li) => ({
    amountPaidPence: li.amountPaidPence,
    isFinance: li.isFinance,
    financeFeePence: li.financeFeePence,
  }));

  const payslipAfter = await recalcPayslipTotals(practiceId, payPeriodId, payslipEntryId, refreshedLines);
  await syncPayslipProvisional(
    db,
    payslipEntryId,
    remaining.map((li) => ({
      isFinance: li.isFinance,
      amountPence: li.amountPence,
      financeFeePence: li.financeFeePence,
      financeTermMonths: li.financeTermMonths,
      financeFeeManual: li.financeFeeManual,
    }))
  );
  const totals = totalsFromLines(refreshedLines);
  return { removed: line, totals: legacyTotalsFromPence(totals), payslip: payslipAfter };
}
