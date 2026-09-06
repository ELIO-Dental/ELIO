/**
 * PDF §4.3 payment flags — ops visibility for unpaid / part-paid lines.
 * Required fields: patient name, amount, treatment, invoice date, outstanding balance.
 */

export interface PaymentFlag {
  patientName: string;
  amountPence: number;
  treatment: string;
  invoiceDate: string;
  outstandingBalancePence: number;
  /** Extra audit — not required by PDF list but useful for review UI. */
  paymentStatus: "unpaid" | "partial" | "paid";
  invoiceId?: string;
  patientId?: string;
  flagReason?: string;
}

export type RevenueLineForGross = {
  amountPence: number;
  excludedAsConsultation?: boolean;
  treatmentId?: string | null;
  id?: string;
  paymentStatus?: string | null;
  flagged?: boolean | null;
  amountOutstandingPence?: number | null;
};

/** Fully paid lines only enter associate gross (PDF §4.3). */
export function lineCountsTowardGross(line: RevenueLineForGross): boolean {
  if (line.flagged) return false;
  const status = (line.paymentStatus ?? "paid").toLowerCase();
  if (status === "unpaid" || status === "partial") return false;
  if ((line.amountOutstandingPence ?? 0) > 0) return false;
  return status === "paid" || status === "";
}

export function buildPaymentFlagsFromLines(
  lines: Array<{
    patientName?: string | null;
    amountPence: number;
    treatmentDescription?: string | null;
    invoiceDate?: string | null;
    amountOutstandingPence?: number | null;
    paymentStatus?: string | null;
    flagged?: boolean | null;
    flagReason?: string | null;
    dentallyInvoiceId?: string | null;
    dentallyPatientId?: string | null;
  }>
): PaymentFlag[] {
  const flags: PaymentFlag[] = [];
  for (const line of lines) {
    const status = (line.paymentStatus ?? "").toLowerCase();
    const isFlagged =
      Boolean(line.flagged) || status === "unpaid" || status === "partial";
    if (!isFlagged) continue;
    const outstanding =
      line.amountOutstandingPence != null && line.amountOutstandingPence > 0
        ? line.amountOutstandingPence
        : status === "unpaid"
          ? line.amountPence
          : Math.max(0, line.amountOutstandingPence ?? 0);
    flags.push({
      patientName: line.patientName?.trim() || "Unknown",
      amountPence: line.amountPence,
      treatment: line.treatmentDescription?.trim() || "",
      invoiceDate: line.invoiceDate?.trim() || "",
      outstandingBalancePence: outstanding,
      paymentStatus: status === "partial" ? "partial" : "unpaid",
      invoiceId: line.dentallyInvoiceId ?? undefined,
      patientId: line.dentallyPatientId ?? undefined,
      flagReason: line.flagReason ?? undefined,
    });
  }
  return flags;
}

/** Map payment flags → existing discrepancy JSON shape for review UI. */
export function paymentFlagsToDiscrepancies(flags: PaymentFlag[]): Array<{
  type: "invoiced_not_paid" | "partial_payment";
  patientName: string;
  patientId?: string;
  invoiceId?: string;
  invoicedAmount: number;
  paidAmount: number;
  date: string;
  notes: string;
  treatment?: string;
  outstandingBalance?: number;
}> {
  return flags.map((f) => ({
    type: f.paymentStatus === "partial" ? "partial_payment" : "invoiced_not_paid",
    patientName: f.patientName,
    patientId: f.patientId,
    invoiceId: f.invoiceId,
    invoicedAmount: f.amountPence / 100,
    paidAmount: Math.max(0, (f.amountPence - f.outstandingBalancePence) / 100),
    date: f.invoiceDate,
    notes: [
      f.flagReason,
      f.treatment ? `Treatment: ${f.treatment}` : null,
      `Outstanding: £${(f.outstandingBalancePence / 100).toFixed(2)}`,
    ]
      .filter(Boolean)
      .join(" · "),
    treatment: f.treatment,
    outstandingBalance: f.outstandingBalancePence / 100,
  }));
}
