/**
 * PDF §7 / Step 13 — period-level ops review queue (ops/admin only).
 * Flags: unpaid/partial, finance needs term, unmapped, possible duplicate.
 */

import type { PayDiscrepancy, PayDiscrepancyType } from "./pay-discrepancies";
import {
  parseUnmappedFromFetchResult,
  unmappedHitsToDiscrepancies,
} from "./unmapped-practitioners";
import { paymentFlagsToDiscrepancies, buildPaymentFlagsFromLines } from "./payment-flags";
import { lineNeedsFinanceTermOrFee } from "./finance-fee";

export type OpsReviewLine = {
  id?: string;
  dentistId?: string;
  dentistName?: string;
  patientName?: string | null;
  dentallyPatientId?: string | null;
  dentallyInvoiceId?: string | null;
  amountPence: number;
  amountPaidPence?: number | null;
  amountOutstandingPence?: number | null;
  paymentStatus?: string | null;
  flagged?: boolean | null;
  flagReason?: string | null;
  treatmentDescription?: string | null;
  invoiceDate?: string | null;
  isFinance?: boolean | null;
  financeFeePence?: number | null;
  financeTermMonths?: number | null;
  financeFeeManual?: boolean | null;
};

export type OpsReviewItem = PayDiscrepancy & {
  /** Which payslip / dentist the line belongs to (when known). */
  dentistName?: string;
  dentistId?: string;
  lineId?: string;
  priorPeriodId?: string;
};

function normalizePatientKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Stable match key: prefer Dentally patient id + amount; else name + amount. */
export function duplicateMatchKey(line: {
  dentallyPatientId?: string | null;
  patientName?: string | null;
  amountPence: number;
}): string {
  const pid = line.dentallyPatientId?.trim();
  if (pid) return `id:${pid}|${line.amountPence}`;
  return `name:${normalizePatientKey(line.patientName)}|${line.amountPence}`;
}

export function lineIsFullyPaid(line: OpsReviewLine): boolean {
  const status = (line.paymentStatus ?? "").toLowerCase();
  if (line.flagged) return false;
  if (status === "unpaid" || status === "partial") return false;
  if ((line.amountOutstandingPence ?? 0) > 0) return false;
  return status === "paid" || status === "";
}

/** Finance detected but ops has not set term and/or fee (Step 16). */
export function lineNeedsFinanceTerm(line: OpsReviewLine): boolean {
  return lineNeedsFinanceTermOrFee({
    isFinance: line.isFinance,
    amountPence: line.amountPence,
    financeFeePence: line.financeFeePence,
    financeTermMonths: line.financeTermMonths,
    financeFeeManual: line.financeFeeManual,
  });
}

export function buildPriorPaidKeys(priorPaidLines: OpsReviewLine[]): Set<string> {
  const keys = new Set<string>();
  for (const line of priorPaidLines) {
    if (!lineIsFullyPaid(line)) continue;
    keys.add(duplicateMatchKey(line));
  }
  return keys;
}

export function buildFinanceTermDiscrepancies(lines: OpsReviewLine[]): OpsReviewItem[] {
  const out: OpsReviewItem[] = [];
  for (const line of lines) {
    if (!lineNeedsFinanceTerm(line)) continue;
    out.push({
      type: "needs_finance_term",
      patientName: line.patientName?.trim() || "Unknown",
      invoicedAmount: line.amountPence / 100,
      paidAmount: (line.amountPaidPence ?? 0) / 100,
      date: line.invoiceDate?.trim() || "",
      notes: "Finance payment — set term (3/12/36/60) and/or fee before finalize. Default if neither: 12 months @ settings rate (provisional).",
      treatment: line.treatmentDescription ?? undefined,
      invoiceId: line.dentallyInvoiceId ?? undefined,
      patientId: line.dentallyPatientId ?? undefined,
      dentistName: line.dentistName,
      dentistId: line.dentistId,
      lineId: line.id,
    });
  }
  return out;
}

export function buildDuplicateDiscrepancies(
  currentLines: OpsReviewLine[],
  priorPaidKeys: Set<string>,
  priorPeriodId?: string
): OpsReviewItem[] {
  const out: OpsReviewItem[] = [];
  for (const line of currentLines) {
    const key = duplicateMatchKey(line);
    if (!priorPaidKeys.has(key)) continue;
    out.push({
      type: "possible_duplicate",
      patientName: line.patientName?.trim() || "Unknown",
      invoicedAmount: line.amountPence / 100,
      paidAmount: (line.amountPaidPence ?? 0) / 100,
      date: line.invoiceDate?.trim() || "",
      notes: priorPeriodId
        ? `Same patient + amount already paid in prior period ${priorPeriodId}. Confirm before including in gross.`
        : "Same patient + amount already paid in a previous month. Confirm before including in gross.",
      treatment: line.treatmentDescription ?? undefined,
      invoiceId: line.dentallyInvoiceId ?? undefined,
      patientId: line.dentallyPatientId ?? undefined,
      dentistName: line.dentistName,
      dentistId: line.dentistId,
      lineId: line.id,
      priorPeriodId,
    });
  }
  return out;
}

/** Step 14 — duplicates from PaidInvoiceLineLog (authoritative). */
export function buildPaidLogDuplicateDiscrepancies(
  currentLines: OpsReviewLine[],
  paidLogHits: Array<{ line: OpsReviewLine; priorPeriodId: string }>
): OpsReviewItem[] {
  return paidLogHits.map(({ line, priorPeriodId }) => ({
    type: "possible_duplicate" as const,
    patientName: line.patientName?.trim() || "Unknown",
    invoicedAmount: line.amountPence / 100,
    paidAmount: (line.amountPaidPence ?? 0) / 100,
    date: line.invoiceDate?.trim() || "",
    notes: `PaidInvoiceLineLog: already paid in period ${priorPeriodId}. Excluded from gross.`,
    treatment: line.treatmentDescription ?? undefined,
    invoiceId: line.dentallyInvoiceId ?? undefined,
    patientId: line.dentallyPatientId ?? undefined,
    dentistName: line.dentistName,
    dentistId: line.dentistId,
    lineId: line.id,
    priorPeriodId,
  }));
}


export function buildUnpaidDiscrepancies(lines: OpsReviewLine[]): OpsReviewItem[] {
  const flags = buildPaymentFlagsFromLines(lines);
  const base = paymentFlagsToDiscrepancies(flags);
  // Attach dentist context by matching invoice/patient when possible.
  return base.map((d) => {
    const match = lines.find(
      (l) =>
        (d.invoiceId && l.dentallyInvoiceId === d.invoiceId) ||
        (d.patientId &&
          l.dentallyPatientId === d.patientId &&
          l.amountPence === Math.round(d.invoicedAmount * 100))
    );
    return {
      ...d,
      dentistName: match?.dentistName,
      dentistId: match?.dentistId,
      lineId: match?.id,
    };
  });
}

/** Aggregate all Step 13 review rows for a pay period. */
export function buildOpsReviewList(input: {
  currentLines: OpsReviewLine[];
  priorPaidLines: OpsReviewLine[];
  priorPeriodId?: string | null;
  fetchResultJson?: unknown;
  /** Step 14 — lines already in PaidInvoiceLineLog for another period. */
  paidLogDuplicateHits?: Array<{ line: OpsReviewLine; priorPeriodId: string }>;
}): OpsReviewItem[] {
  const unpaid = buildUnpaidDiscrepancies(input.currentLines);
  const finance = buildFinanceTermDiscrepancies(input.currentLines);
  const priorKeys = buildPriorPaidKeys(input.priorPaidLines);
  const duplicatesHeuristic = buildDuplicateDiscrepancies(
    input.currentLines,
    priorKeys,
    input.priorPeriodId ?? undefined
  );
  const duplicatesLog = buildPaidLogDuplicateDiscrepancies(
    input.currentLines,
    input.paidLogDuplicateHits ?? []
  );
  // Prefer log-backed duplicates; keep heuristic for unseeded history.
  const dupKeys = new Set(
    duplicatesLog.map((d) => `${d.invoiceId ?? ""}|${d.patientId ?? ""}|${d.invoicedAmount}`)
  );
  const duplicates = [
    ...duplicatesLog,
    ...duplicatesHeuristic.filter(
      (d) => !dupKeys.has(`${d.invoiceId ?? ""}|${d.patientId ?? ""}|${d.invoicedAmount}`)
    ),
  ];
  const unmapped = unmappedHitsToDiscrepancies(
    parseUnmappedFromFetchResult(input.fetchResultJson)
  ).map((d) => ({ ...d } as OpsReviewItem));

  const order: PayDiscrepancyType[] = [
    "invoiced_not_paid",
    "partial_payment",
    "needs_finance_term",
    "unmapped_practitioner",
    "possible_duplicate",
  ];
  const all = [...unpaid, ...finance, ...unmapped, ...duplicates];
  return all.sort((a, b) => {
    const ai = order.indexOf(a.type);
    const bi = order.indexOf(b.type);
    if (ai !== bi) return ai - bi;
    return (a.date || "").localeCompare(b.date || "");
  });
}

/** Step 30 — ops review is run-period only (not pay:view / not clinicians). */
export function canAccessOpsReview(permissions: string[]): boolean {
  return permissions.includes("pay:run-period");
}
