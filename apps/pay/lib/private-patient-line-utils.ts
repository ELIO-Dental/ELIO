export function totalsFromLines(lines: Array<{ amountPaidPence?: number | null; isFinance: boolean; financeFeePence?: number | null }>) {
  let grossPrivateRevenuePence = 0;
  let financeFeesPence = 0;
  for (const line of lines) {
    grossPrivateRevenuePence += line.amountPaidPence ?? 0;
    if (line.isFinance && line.financeFeePence) {
      financeFeesPence += line.financeFeePence;
    }
  }
  return { grossPrivateRevenuePence, financeFeesPence };
}

/** Legacy AuraPay totals shape (pounds) for API compatibility (Y2.1b). */
export function legacyTotalsFromPence(totals: { grossPrivateRevenuePence: number; financeFeesPence: number }) {
  return {
    grossPrivate: Math.round(totals.grossPrivateRevenuePence) / 100,
    financeFees: Math.round(totals.financeFeesPence) / 100,
    grossPrivateRevenuePence: totals.grossPrivateRevenuePence,
    financeFeesPence: totals.financeFeesPence,
  };
}

export type PrivatePatientLineDraft = {
  amountPence: number;
  amountPaidPence: number | null;
  amountOutstandingPence: number | null;
  paymentStatus: string | null;
  isFinance: boolean;
  financeFeePence: number | null;
  flagged: boolean;
  flagReason: string | null;
};

export type PrivatePatientLineUpdates = {
  patientName?: string;
  invoiceDate?: string;
  paymentStatus?: "paid" | "partial" | "unpaid";
  isFinance?: boolean;
  financeFeePence?: number;
  amountPence?: number;
  flagged?: boolean;
  flagReason?: string | null;
};

/** Apply legacy patient-row updates (AuraPay periods/patients PUT semantics, Y2.1b). */
export function applyPrivatePatientLineUpdates(line: PrivatePatientLineDraft, updates: PrivatePatientLineUpdates) {
  if (updates.amountPence !== undefined) {
    const oldAmount = line.amountPence;
    line.amountPence = updates.amountPence;
    if (line.paymentStatus === "paid") {
      line.amountPaidPence = updates.amountPence;
      line.amountOutstandingPence = 0;
    } else if (line.paymentStatus === "unpaid") {
      line.amountPaidPence = 0;
      line.amountOutstandingPence = updates.amountPence;
    } else if (line.paymentStatus === "partial" && line.amountPaidPence != null) {
      const ratio = oldAmount > 0 ? line.amountPaidPence / oldAmount : 0;
      line.amountPaidPence = Math.round(updates.amountPence * ratio);
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

/** Resolve legacy patient_index to a line item id (sorted by invoice date). */
export function resolveLineItemIdByIndex(
  lines: Array<{ id: string; invoiceDate: string | null; createdAt: Date }>,
  patientIndex: number
): string | null {
  if (patientIndex < 0) return null;
  const sorted = [...lines].sort((a, b) => {
    const dateCompare = (a.invoiceDate ?? "").localeCompare(b.invoiceDate ?? "");
    if (dateCompare !== 0) return dateCompare;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  if (patientIndex >= sorted.length) return null;
  return sorted[patientIndex]?.id ?? null;
}

export function patientIndexForLineId(
  lines: Array<{ id: string; invoiceDate: string | null; createdAt: Date }>,
  lineItemId: string
): number {
  const sorted = [...lines].sort((a, b) => {
    const dateCompare = (a.invoiceDate ?? "").localeCompare(b.invoiceDate ?? "");
    if (dateCompare !== 0) return dateCompare;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted.findIndex((line) => line.id === lineItemId);
}
