import { scopedDb } from "@elio/db";
import type { PayslipPdfInput } from "./payslip-pdf";

const payslipInclude = {
  dentist: true,
  payPeriod: true,
  privateRevenueLineItems: { include: { treatment: true } },
} as const;

/** Loads a payslip with relations required for PDF generation and email (Y3.8). */
export async function loadPayslipPdfInput(
  practiceId: string,
  payslipEntryId: string
): Promise<PayslipPdfInput | null> {
  const db = scopedDb(practiceId);
  return db.payslipEntry.findUnique({
    where: { id: payslipEntryId },
    include: payslipInclude,
  });
}
