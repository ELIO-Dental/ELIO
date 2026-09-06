import { createHash } from "crypto";
import { scopedDb } from "@elio/db";
import { generatePayslipPdf, type PayslipPdfInput } from "./payslip-pdf";
import { loadPayslipPdfInput } from "./payslip-load";

export type PayslipVersionSnapshot = {
  finalPayPence: number | null;
  provisional: boolean;
  practiceName: string | null;
  financeFeeSplit: number | null;
  dentistName: string;
  periodStart: string;
  periodEnd: string;
  labDeductionPence: number | null;
  filename: string;
};

export function hashPdfBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function nextPayslipVersionNumber(existingMax: number | null | undefined): number {
  return (existingMax ?? 0) + 1;
}

export function buildPayslipVersionSnapshot(
  payslip: PayslipPdfInput,
  filename: string
): PayslipVersionSnapshot {
  return {
    finalPayPence: payslip.finalPayPence ?? null,
    provisional: Boolean(payslip.provisional),
    practiceName: payslip.practiceName ?? null,
    financeFeeSplit: payslip.financeFeeSplit ?? null,
    dentistName: payslip.dentist.name,
    periodStart: payslip.payPeriod.periodStart.toISOString(),
    periodEnd: payslip.payPeriod.periodEnd.toISOString(),
    labDeductionPence: payslip.labDeductionPence ?? null,
    filename,
  };
}

export function versionedPdfHref(payslipEntryId: string, version: number): string {
  return `/pay/api/payslips/${payslipEntryId}/pdf?version=${version}`;
}

/**
 * Step 26 — on lock, snapshot each payslip PDF as an immutable PayslipVersion.
 * Re-lock after reopen creates v2, v3, … prior versions unchanged.
 */
export async function snapshotPayslipVersionsOnLock(
  practiceId: string,
  payPeriodId: string,
  lockedAt = new Date()
): Promise<{ created: number }> {
  const db = scopedDb(practiceId);
  const entries = await db.payslipEntry.findMany({
    where: { payPeriodId },
    select: { id: true, provisional: true },
  });

  let created = 0;
  for (const entry of entries) {
    const latest = await db.payslipVersion.findFirst({
      where: { payslipEntryId: entry.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = nextPayslipVersionNumber(latest?.version);

    const payslip = await loadPayslipPdfInput(practiceId, entry.id);
    if (!payslip) continue;

    const { buffer, filename } = await generatePayslipPdf(payslip);
    const contentSha256 = hashPdfBuffer(buffer);
    const snapshotJson = buildPayslipVersionSnapshot(payslip, filename);

    await db.payslipVersion.create({
      data: {
        practiceId,
        payslipEntryId: entry.id,
        version,
        lockedAt,
        snapshotJson,
        pdfBase64: buffer.toString("base64"),
        contentSha256,
        provisional: entry.provisional,
      },
    });

    await db.payslipEntry.update({
      where: { id: entry.id },
      data: { pdfUrl: versionedPdfHref(entry.id, version) },
    });
    created += 1;
  }

  return { created };
}

export type StoredPayslipPdf = {
  buffer: Buffer;
  filename: string;
  version: number;
  contentSha256: string;
};

/** Load immutable stored PDF for a version (default: latest). */
export async function loadStoredPayslipPdf(
  practiceId: string,
  payslipEntryId: string,
  version?: number | null
): Promise<StoredPayslipPdf | null> {
  const db = scopedDb(practiceId);
  const row =
    version != null && Number.isFinite(version)
      ? await db.payslipVersion.findUnique({
          where: {
            payslipEntryId_version: { payslipEntryId, version: Math.trunc(version) },
          },
        })
      : await db.payslipVersion.findFirst({
          where: { payslipEntryId },
          orderBy: { version: "desc" },
        });

  if (!row?.pdfBase64) return null;

  const snap = row.snapshotJson as PayslipVersionSnapshot | null;
  const filename =
    snap?.filename ||
    `payslip-v${row.version}.pdf`;

  return {
    buffer: Buffer.from(row.pdfBase64, "base64"),
    filename,
    version: row.version,
    contentSha256: row.contentSha256,
  };
}
