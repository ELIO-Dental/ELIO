/**
 * DB helpers for PaidInvoiceLineLog (Step 14).
 */

import {
  buildPaidLogLookup,
  resolvePaidIdentity,
  type PaidLineIdentity,
  type PaidLogEntry,
  paidLogCompositeKey,
} from "./paid-invoice-line-log";

/** Loose client shape — scopedDb extension types don't match PrismaClient Pick. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PaidLogDb = { paidInvoiceLineLog: any };

export async function loadPaidLogLookup(
  db: PaidLogDb,
  practiceId: string
): Promise<Map<string, PaidLogEntry>> {
  const rows = await db.paidInvoiceLineLog.findMany({
    where: { practiceId },
    select: {
      invoiceId: true,
      lineKey: true,
      payPeriodId: true,
      amountPence: true,
      dentistId: true,
    },
  });
  return buildPaidLogLookup(rows);
}

export async function deletePaidLogForPeriod(
  db: PaidLogDb,
  practiceId: string,
  payPeriodId: string
): Promise<number> {
  const result = await db.paidInvoiceLineLog.deleteMany({
    where: { practiceId, payPeriodId },
  });
  return result.count ?? 0;
}

export async function upsertPaidLogEntries(
  db: PaidLogDb,
  practiceId: string,
  payPeriodId: string,
  dentistId: string,
  lines: PaidLineIdentity[]
): Promise<number> {
  let n = 0;
  for (const line of lines) {
    const id = resolvePaidIdentity(line, dentistId);
    if (!id) continue; // no Dentally invoice id — refuse unstable orphan keys
    const { invoiceId, lineKey } = id;

    const existing = await db.paidInvoiceLineLog.findUnique({
      where: {
        practiceId_invoiceId_lineKey: { practiceId, invoiceId, lineKey },
      },
      select: { payPeriodId: true },
    });
    // Never overwrite a payout logged for a different period (double-pay guard).
    if (existing && existing.payPeriodId !== payPeriodId) continue;

    await db.paidInvoiceLineLog.upsert({
      where: {
        practiceId_invoiceId_lineKey: { practiceId, invoiceId, lineKey },
      },
      create: {
        practiceId,
        invoiceId,
        lineKey,
        dentistId,
        payPeriodId,
        amountPence: line.amountPence,
      },
      update: {
        dentistId,
        amountPence: line.amountPence,
      },
    });
    n++;
  }
  return n;
}

export { paidLogCompositeKey, resolvePaidIdentity };
