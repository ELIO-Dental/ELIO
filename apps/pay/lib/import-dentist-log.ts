import { scopedDb } from "@elio/db";
import {
  compareDentistLogWithSystem,
  dentistLogCompareSummary,
  parseDentistLogCsv,
  type DentistLogEntry,
} from "./dentist-log-compare";
import { parsePayDiscrepancies } from "./pay-discrepancies";

function assertDraftPeriod(status: string) {
  if (status === "LOCKED") throw new Error("Pay period is locked");
}

/** Import dentist log and merge comparison discrepancies (legacy Y2.7). */
export async function importDentistLogForPayslip(
  practiceId: string,
  payPeriodId: string,
  payslipEntryId: string,
  input: { csvData?: string; logEntries?: DentistLogEntry[] }
) {
  const db = scopedDb(practiceId);
  const payslip = await db.payslipEntry.findFirst({
    where: { id: payslipEntryId, payPeriodId, practiceId },
    include: {
      payPeriod: true,
      privateRevenueLineItems: { orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!payslip) throw new Error("Payslip not found");
  assertDraftPeriod(payslip.payPeriod.status);

  const parsedLogEntries = input.csvData
    ? parseDentistLogCsv(input.csvData)
    : input.logEntries ?? [];

  if (parsedLogEntries.length === 0) {
    throw new Error("No valid log entries found");
  }

  const systemPatients = payslip.privateRevenueLineItems.map((line) => ({
    name: line.patientName ?? "Unknown",
    date: line.invoiceDate ?? "",
    amount: line.amountPence / 100,
    amountPaid: (line.amountPaidPence ?? line.amountPence) / 100,
    status: line.paymentStatus,
  }));

  const existingDiscrepancies = parsePayDiscrepancies(payslip.dentallyDiscrepanciesJson);
  const { logDiscrepancies, allDiscrepancies } = compareDentistLogWithSystem(
    parsedLogEntries,
    systemPatients,
    existingDiscrepancies
  );

  await db.payslipEntry.update({
    where: { id: payslipEntryId },
    data: {
      dentallyDentistLogJson: parsedLogEntries,
      dentallyDiscrepanciesJson: allDiscrepancies,
    },
  });

  return {
    message: `Imported ${parsedLogEntries.length} log entries, found ${logDiscrepancies.length} discrepancies`,
    summary: dentistLogCompareSummary(parsedLogEntries, systemPatients, logDiscrepancies),
    discrepancies: logDiscrepancies,
    log: parsedLogEntries,
  };
}
