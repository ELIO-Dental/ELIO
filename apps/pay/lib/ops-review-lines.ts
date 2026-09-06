import type { OpsReviewLine } from "./ops-review";

/** Flatten payslip private lines for ops review / duplicate scan. */
export function flattenPayslipLinesForOpsReview(
  payslips: Array<{
    dentistId: string;
    dentist: { name: string };
    privateRevenueLineItems: Array<{
      id: string;
      patientName: string | null;
      dentallyPatientId: string | null;
      dentallyInvoiceId: string | null;
      amountPence: number;
      amountPaidPence: number | null;
      amountOutstandingPence: number | null;
      paymentStatus: string | null;
      flagged: boolean;
      flagReason: string | null;
      treatmentDescription: string | null;
      invoiceDate: string | null;
      isFinance: boolean;
      financeFeePence: number | null;
      financeTermMonths?: number | null;
      financeFeeManual?: boolean | null;
    }>;
  }>
): OpsReviewLine[] {
  const lines: OpsReviewLine[] = [];
  for (const p of payslips) {
    for (const line of p.privateRevenueLineItems) {
      lines.push({
        id: line.id,
        dentistId: p.dentistId,
        dentistName: p.dentist.name,
        patientName: line.patientName,
        dentallyPatientId: line.dentallyPatientId,
        dentallyInvoiceId: line.dentallyInvoiceId,
        amountPence: line.amountPence,
        amountPaidPence: line.amountPaidPence,
        amountOutstandingPence: line.amountOutstandingPence,
        paymentStatus: line.paymentStatus,
        flagged: line.flagged,
        flagReason: line.flagReason,
        treatmentDescription: line.treatmentDescription,
        invoiceDate: line.invoiceDate,
        isFinance: line.isFinance,
        financeFeePence: line.financeFeePence,
        financeTermMonths: line.financeTermMonths ?? null,
        financeFeeManual: line.financeFeeManual ?? null,
      });
    }
  }
  return lines;
}
