// Wires @elio/pay-engine's pure functions to real Prisma/scopedDb() calls —
// MASTER_BUILD_GUIDE.md Step 1.6. Every function here takes practiceId
// first and uses scopedDb(practiceId) so no query can leak cross-tenant.
import { scopedDb } from "@elio/db";
import { writeAuditLog } from "@elio/auth";
import {
  getPeriodForTriggerDate,
  parseCompassStatement,
  calculatePrivateEarnings,
  calculateFinalPay,
  calculateLabDeduction,
  type TreatmentRecord,
} from "@elio/pay-engine";
import { financeFeesDeductionPence, privateRevenueItemsToTreatments, therapyDeductionPence } from "./private-revenue";
import { lineCountsTowardGross } from "./payment-flags";
import { isAlreadyPaidInOtherPeriod } from "./paid-invoice-line-log";
import { loadPaidLogLookup, upsertPaidLogEntries } from "./paid-invoice-line-log-db";
import { labBillAmountsPenceFromPayslipJson, labBillEntriesToPayslipJson, labBillPeriodWhere } from "./lab-bills-period";
import { getPaySettings } from "./pay-settings-service";
import { resolveFinanceFeeSplit, resolveLabBillSplit } from "./pay-settings";
import { payslipIsProvisional, resolveFinanceFeesForDeduction } from "./finance-fee";
import { resolveDentistRatesAsOf, resolveShareBp, periodRatesAsOfDate } from "./dentist-rates";
import { resolveNhsUdasForCalc } from "./nhs-udas";
import { ACTIVE_DENTIST_WHERE } from "./active-dentists";

// ---------------------------------------------------------------------------
// Dentists
// ---------------------------------------------------------------------------

export async function listDentists(practiceId: string) {
  const db = scopedDb(practiceId);
  return db.dentist.findMany({
    where: ACTIVE_DENTIST_WHERE,
    orderBy: { name: "asc" },
  });
}

export interface CreateDentistInput {
  name: string;
  email?: string | null;
  nhsPerformerNumber?: string | null;
  dentallyPractitionerId?: string | null;
  payType: "PERCENTAGE_SPLIT" | "HOURLY";
  privateSplitPercent?: number | null;
  udaRatePence?: number | null;
  hourlyRatePence?: number | null;
  labShareBp?: number | null;
  financeShareBp?: number | null;
  therapyHourlyPence?: number | null;
}

async function appendDentistRateHistory(
  db: ReturnType<typeof scopedDb>,
  practiceId: string,
  dentistId: string,
  snap: {
    privateSplitPercent?: number | null;
    udaRatePence?: number | null;
    hourlyRatePence?: number | null;
    labShareBp?: number | null;
    financeShareBp?: number | null;
    therapyHourlyPence?: number | null;
    effectiveFrom?: Date;
  }
) {
  await db.dentistRateHistory.create({
    data: {
      practiceId,
      dentistId,
      effectiveFrom: snap.effectiveFrom ?? new Date(),
      privateSplitPercent: snap.privateSplitPercent ?? null,
      udaRatePence: snap.udaRatePence ?? null,
      hourlyRatePence: snap.hourlyRatePence ?? null,
      labShareBp: snap.labShareBp ?? null,
      financeShareBp: snap.financeShareBp ?? null,
      therapyHourlyPence: snap.therapyHourlyPence ?? null,
    },
  });
}

export async function createDentist(practiceId: string, input: CreateDentistInput) {
  const db = scopedDb(practiceId);
  const effectiveFrom = new Date();
  const dentist = await db.dentist.create({
    data: {
      practiceId,
      name: input.name,
      email: input.email?.trim() || null,
      nhsPerformerNumber: input.nhsPerformerNumber ?? null,
      dentallyPractitionerId: input.dentallyPractitionerId?.trim() || null,
      payType: input.payType,
      privateSplitPercent: input.privateSplitPercent ?? null,
      udaRatePence: input.udaRatePence ?? null,
      hourlyRatePence: input.hourlyRatePence ?? null,
      labShareBp: input.labShareBp ?? null,
      financeShareBp: input.financeShareBp ?? null,
      therapyHourlyPence: input.therapyHourlyPence ?? null,
      effectiveFrom,
    },
  });
  await appendDentistRateHistory(db, practiceId, dentist.id, {
    privateSplitPercent: input.privateSplitPercent ?? null,
    udaRatePence: input.udaRatePence ?? null,
    hourlyRatePence: input.hourlyRatePence ?? null,
    labShareBp: input.labShareBp ?? null,
    financeShareBp: input.financeShareBp ?? null,
    therapyHourlyPence: input.therapyHourlyPence ?? null,
    effectiveFrom,
  });
  return dentist;
}

/**
 * §6.1 / Step 21 rate versioning: update current row + append DentistRateHistory.
 * Locked PayslipEntry rows keep snapshotted figures and never re-read live rates.
 */
export async function updateDentistRate(
  practiceId: string,
  dentistId: string,
  patch: Partial<
    Pick<
      CreateDentistInput,
      | "privateSplitPercent"
      | "udaRatePence"
      | "hourlyRatePence"
      | "labShareBp"
      | "financeShareBp"
      | "therapyHourlyPence"
    >
  >
) {
  const db = scopedDb(practiceId);
  const effectiveFrom = new Date();
  const dentist = await db.dentist.update({
    where: { id: dentistId },
    data: { ...patch, effectiveFrom },
  });
  await appendDentistRateHistory(db, practiceId, dentistId, { ...patch, effectiveFrom });
  return dentist;
}

export interface UpdateDentistInput {
  name?: string;
  email?: string | null;
  nhsPerformerNumber?: string | null;
  dentallyPractitionerId?: string | null;
  privateSplitPercent?: number | null;
  udaRatePence?: number | null;
  hourlyRatePence?: number | null;
  labShareBp?: number | null;
  financeShareBp?: number | null;
  therapyHourlyPence?: number | null;
}

export async function updateDentist(practiceId: string, dentistId: string, input: UpdateDentistInput) {
  const db = scopedDb(practiceId);
  const existing = await db.dentist.findFirst({ where: { id: dentistId, practiceId } });
  if (!existing) throw new Error("Dentist not found");

  const rateChanged =
    input.privateSplitPercent !== undefined ||
    input.udaRatePence !== undefined ||
    input.hourlyRatePence !== undefined ||
    input.labShareBp !== undefined ||
    input.financeShareBp !== undefined ||
    input.therapyHourlyPence !== undefined;

  const effectiveFrom = new Date();
  const dentist = await db.dentist.update({
    where: { id: dentistId },
    data: {
      name: input.name ?? undefined,
      email: input.email !== undefined ? (input.email?.trim() || null) : undefined,
      nhsPerformerNumber: input.nhsPerformerNumber !== undefined ? input.nhsPerformerNumber : undefined,
      dentallyPractitionerId:
        input.dentallyPractitionerId !== undefined ? input.dentallyPractitionerId : undefined,
      privateSplitPercent: input.privateSplitPercent !== undefined ? input.privateSplitPercent : undefined,
      udaRatePence: input.udaRatePence !== undefined ? input.udaRatePence : undefined,
      hourlyRatePence: input.hourlyRatePence !== undefined ? input.hourlyRatePence : undefined,
      labShareBp: input.labShareBp !== undefined ? input.labShareBp : undefined,
      financeShareBp: input.financeShareBp !== undefined ? input.financeShareBp : undefined,
      therapyHourlyPence: input.therapyHourlyPence !== undefined ? input.therapyHourlyPence : undefined,
      ...(rateChanged ? { effectiveFrom } : {}),
    },
  });

  if (rateChanged) {
    await appendDentistRateHistory(db, practiceId, dentistId, {
      privateSplitPercent:
        input.privateSplitPercent !== undefined
          ? input.privateSplitPercent
          : existing.privateSplitPercent != null
            ? Number(existing.privateSplitPercent)
            : null,
      udaRatePence: input.udaRatePence !== undefined ? input.udaRatePence : existing.udaRatePence,
      hourlyRatePence: input.hourlyRatePence !== undefined ? input.hourlyRatePence : existing.hourlyRatePence,
      labShareBp: input.labShareBp !== undefined ? input.labShareBp : existing.labShareBp,
      financeShareBp: input.financeShareBp !== undefined ? input.financeShareBp : existing.financeShareBp,
      therapyHourlyPence:
        input.therapyHourlyPence !== undefined ? input.therapyHourlyPence : existing.therapyHourlyPence,
      effectiveFrom,
    });
  }

  return dentist;
}

const REMOVED_PREFIX = "[REMOVED] ";

/**
 * Soft-remove when the dentist still has historical pay/bill links; otherwise hard-delete.
 * Soft: rename to `[REMOVED] …` (no double-prefix), clear identity/contact fields.
 */
export async function deleteDentist(practiceId: string, dentistId: string) {
  const db = scopedDb(practiceId);
  const existing = await db.dentist.findFirst({ where: { id: dentistId, practiceId } });
  if (!existing) throw new Error("Dentist not found");

  const [
    payslipCount,
    labBillCount,
    supplierInvoiceCount,
    paidLogCount,
    hourCount,
    payLineCount,
    treatmentCount,
    consultCount,
  ] = await Promise.all([
    db.payslipEntry.count({ where: { dentistId } }),
    db.labBillEntry.count({ where: { dentistId } }),
    db.supplierInvoiceEntry.count({ where: { dentistId } }),
    db.paidInvoiceLineLog.count({ where: { dentistId } }),
    db.hourEntry.count({ where: { dentistId } }),
    db.payLine.count({ where: { dentistId } }),
    db.treatment.count({ where: { dentistId } }),
    db.consult.count({ where: { practitionerDentistId: dentistId } }),
  ]);

  const hasLinks =
    payslipCount +
      labBillCount +
      supplierInvoiceCount +
      paidLogCount +
      hourCount +
      payLineCount +
      treatmentCount +
      consultCount >
    0;

  if (hasLinks) {
    const name = existing.name.startsWith(REMOVED_PREFIX)
      ? existing.name
      : `${REMOVED_PREFIX}${existing.name}`;
    const dentist = await db.dentist.update({
      where: { id: dentistId },
      data: {
        name,
        dentallyPractitionerId: null,
        nhsPerformerNumber: null,
        email: null,
        userId: null,
      },
    });
    return { mode: "soft" as const, dentist };
  }

  await db.dentistRateHistory.deleteMany({ where: { dentistId, practiceId } });
  await db.dentist.delete({ where: { id: dentistId } });
  return { mode: "hard" as const, dentist: existing };
}

// ---------------------------------------------------------------------------
// Lab bills
// ---------------------------------------------------------------------------

export async function listLabBills(
  practiceId: string,
  options?: { dentistId?: string; year?: number; month?: number }
) {
  const db = scopedDb(practiceId);
  const where: {
    dentistId?: string;
    OR?: Array<{ billDate?: { gte: Date; lt: Date } } | { billDate: null; createdAt: { gte: Date; lt: Date } }>;
  } = {};

  if (options?.dentistId) where.dentistId = options.dentistId;

  if (options?.year) {
    const startMonth = options.month ?? 1;
    const endMonth = options.month ?? 12;
    const rangeStart = new Date(Date.UTC(options.year, startMonth - 1, 1));
    const rangeEnd = new Date(Date.UTC(options.year, endMonth, 1));
    where.OR = [
      { billDate: { gte: rangeStart, lt: rangeEnd } },
      { billDate: null, createdAt: { gte: rangeStart, lt: rangeEnd } },
    ];
  }

  return db.labBillEntry.findMany({
    where,
    include: {
      dentist: { select: { id: true, name: true } },
      savedLab: { select: { id: true, name: true } },
    },
    orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
  });
}

export interface CreateLabBillInput {
  dentistId?: string | null;
  savedLabId?: string | null;
  labName?: string | null;
  amountPence: number;
  description?: string | null;
  fileUrl?: string | null;
  billDate?: string | null;
  paid?: boolean;
  paidAt?: Date | null;
}

export async function createLabBill(practiceId: string, input: CreateLabBillInput) {
  const db = scopedDb(practiceId);
  const dentistId = input.dentistId?.trim() || null;
  if (!dentistId) {
    throw new Error("Dentist is required for lab bills (Step 15 — per dentist per month)");
  }
  let labName = input.labName?.trim() || null;
  let savedLabId = input.savedLabId ?? null;

  if (savedLabId) {
    const savedLab = await db.savedLab.findFirst({ where: { id: savedLabId, practiceId } });
    if (!savedLab) throw new Error("Saved lab not found");
    labName = savedLab.name;
  }
  if (!labName) {
    throw new Error("Lab name is required (select a saved lab or enter a name)");
  }

  const created = await db.labBillEntry.create({
    data: {
      practiceId,
      dentistId,
      savedLabId,
      labName,
      amountPence: input.amountPence,
      description: input.description ?? null,
      fileUrl: input.fileUrl ?? null,
      billDate: input.billDate ? new Date(input.billDate) : null,
      paid: input.paid ?? false,
      paidAt: input.paid ? (input.paidAt ?? new Date()) : null,
    },
  });
  await resyncDraftPayslipLabsForDentist(
    practiceId,
    created.dentistId,
    created.billDate ?? created.createdAt
  );
  return created;
}

export async function updateLabBill(
  practiceId: string,
  labBillId: string,
  input: Partial<CreateLabBillInput>
) {
  const db = scopedDb(practiceId);
  const existing = await db.labBillEntry.findFirst({ where: { id: labBillId, practiceId } });
  if (!existing) throw new Error("Lab bill not found");

  let labName = input.labName !== undefined ? input.labName?.trim() || null : existing.labName;
  let savedLabId = input.savedLabId !== undefined ? input.savedLabId : existing.savedLabId;
  if (input.savedLabId) {
    const savedLab = await db.savedLab.findFirst({ where: { id: input.savedLabId, practiceId } });
    if (!savedLab) throw new Error("Saved lab not found");
    labName = savedLab.name;
    savedLabId = savedLab.id;
  }

  const updated = await db.labBillEntry.update({
    where: { id: labBillId },
    data: {
      dentistId: input.dentistId !== undefined ? input.dentistId : undefined,
      savedLabId,
      labName,
      amountPence: input.amountPence,
      description: input.description !== undefined ? input.description : undefined,
      fileUrl: input.fileUrl !== undefined ? input.fileUrl : undefined,
      billDate: input.billDate !== undefined ? (input.billDate ? new Date(input.billDate) : null) : undefined,
      paid: input.paid,
      paidAt: input.paid === false ? null : input.paid ? (input.paidAt ?? new Date()) : undefined,
    },
  });

  // Step 15 — keep draft payslip lab rows in sync after edits.
  await resyncDraftPayslipLabsForDentist(
    practiceId,
    updated.dentistId ?? existing.dentistId,
    updated.billDate ?? existing.billDate ?? existing.createdAt
  );
  if (
    input.dentistId !== undefined &&
    existing.dentistId &&
    input.dentistId !== existing.dentistId
  ) {
    await resyncDraftPayslipLabsForDentist(
      practiceId,
      existing.dentistId,
      existing.billDate ?? existing.createdAt
    );
  }

  return updated;
}

export async function deleteLabBill(practiceId: string, labBillId: string) {
  const db = scopedDb(practiceId);
  const existing = await db.labBillEntry.findFirst({ where: { id: labBillId, practiceId } });
  if (!existing) throw new Error("Lab bill not found");
  await db.labBillEntry.delete({ where: { id: labBillId } });
  await resyncDraftPayslipLabsForDentist(
    practiceId,
    existing.dentistId,
    existing.billDate ?? existing.createdAt
  );
  return { ok: true };
}

/**
 * After lab bill create/update/delete: refresh labBillsJson + labDeduction on DRAFT payslips
 * for that dentist's overlapping calendar month (Step 15 delete → recalc).
 */
export async function resyncDraftPayslipLabsForDentist(
  practiceId: string,
  dentistId: string | null | undefined,
  billDate: Date | null | undefined
) {
  if (!dentistId) return;
  const db = scopedDb(practiceId);
  const when = billDate ?? new Date();
  const year = when.getUTCFullYear();
  const month = when.getUTCMonth();
  const rangeStart = new Date(Date.UTC(year, month, 1));
  const rangeEnd = new Date(Date.UTC(year, month + 1, 1));

  const periods = await db.payPeriod.findMany({
    where: {
      status: "DRAFT",
      periodStart: { lt: rangeEnd },
      periodEnd: { gt: rangeStart },
    },
    select: { id: true, periodStart: true },
  });
  if (periods.length === 0) return;

  const paySettings = await getPaySettings(practiceId);
  const practiceLabBp = resolveLabBillSplit(paySettings);
  const dentist = await db.dentist.findUnique({
    where: { id: dentistId },
    select: { labShareBp: true },
  });
  const labBillSplit = resolveShareBp(dentist?.labShareBp, practiceLabBp);

  for (const period of periods) {
    const payslip = await db.payslipEntry.findFirst({
      where: { payPeriodId: period.id, dentistId },
    });
    if (!payslip || payslip.payType !== "PERCENTAGE_SPLIT") continue;

    const labEntries = await db.labBillEntry.findMany({
      where: labBillPeriodWhere(dentistId, period.periodStart),
      select: { labName: true, amountPence: true, description: true, fileUrl: true },
    });
    const labBillsJson = labBillEntriesToPayslipJson(labEntries);
    const amounts = labEntries.map((e) => e.amountPence).filter((n) => n > 0);
    const labDeductionPence = calculateLabDeduction(amounts, labBillSplit);
    const oldLab = payslip.labDeductionPence ?? 0;
    const data: { labBillsJson: object; labDeductionPence: number; finalPayPence?: number } = {
      labBillsJson: labBillsJson as unknown as object,
      labDeductionPence,
    };
    // Only adjust final pay when a real calculation already exists (avoid −lab before calc).
    if (payslip.finalPayPence != null) {
      data.finalPayPence = payslip.finalPayPence + oldLab - labDeductionPence;
    }

    await db.payslipEntry.update({
      where: { id: payslip.id },
      data,
    });
  }
}

export async function updateLabBillPaid(practiceId: string, labBillId: string, paid: boolean, paidAt?: Date | null) {
  const db = scopedDb(practiceId);
  const existing = await db.labBillEntry.findFirst({ where: { id: labBillId, practiceId } });
  if (!existing) throw new Error("Lab bill not found");

  return db.labBillEntry.update({
    where: { id: labBillId },
    data: { paid, paidAt: paid ? (paidAt ?? new Date()) : null },
  });
}

// ---------------------------------------------------------------------------
// Supplier invoices
// ---------------------------------------------------------------------------

export async function listSupplierInvoices(
  practiceId: string,
  options?: { supplierName?: string; dentistId?: string; year?: number; month?: number }
) {
  const db = scopedDb(practiceId);
  const where: {
    dentistId?: string;
    supplier?: { name: { contains: string; mode: "insensitive" } };
    OR?: Array<
      | { invoiceDate: { gte: Date; lt: Date } }
      | { invoiceDate: null; createdAt: { gte: Date; lt: Date } }
    >;
  } = {};

  if (options?.dentistId) where.dentistId = options.dentistId;
  if (options?.supplierName) {
    where.supplier = { name: { contains: options.supplierName, mode: "insensitive" } };
  }

  if (options?.year) {
    const startMonth = options.month ?? 1;
    const endMonth = options.month ?? 12;
    const rangeStart = new Date(Date.UTC(options.year, startMonth - 1, 1));
    const rangeEnd = new Date(Date.UTC(options.year, endMonth, 1));
    where.OR = [
      { invoiceDate: { gte: rangeStart, lt: rangeEnd } },
      { invoiceDate: null, createdAt: { gte: rangeStart, lt: rangeEnd } },
    ];
  }

  return db.supplierInvoiceEntry.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      dentist: { select: { id: true, name: true } },
    },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  });
}

export interface CreateSupplierInvoiceInput {
  supplierId?: string | null;
  dentistId?: string | null;
  amountPence: number;
  description?: string | null;
  invoiceNumber?: string | null;
  fileUrl?: string | null;
  invoiceDate?: string | null;
  paid?: boolean;
  paidAt?: Date | null;
}

export async function createSupplierInvoice(practiceId: string, input: CreateSupplierInvoiceInput) {
  const db = scopedDb(practiceId);
  return db.supplierInvoiceEntry.create({
    data: {
      practiceId,
      supplierId: input.supplierId ?? null,
      dentistId: input.dentistId?.trim() || null,
      amountPence: input.amountPence,
      description: input.description ?? null,
      invoiceNumber: input.invoiceNumber?.trim() || null,
      fileUrl: input.fileUrl ?? null,
      invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
      paid: input.paid ?? false,
      paidAt: input.paid ? (input.paidAt ?? new Date()) : null,
    },
  });
}

export async function updateSupplierInvoice(
  practiceId: string,
  supplierInvoiceId: string,
  input: Partial<CreateSupplierInvoiceInput>
) {
  const db = scopedDb(practiceId);
  const existing = await db.supplierInvoiceEntry.findFirst({
    where: { id: supplierInvoiceId, practiceId },
  });
  if (!existing) throw new Error("Supplier invoice not found");

  return db.supplierInvoiceEntry.update({
    where: { id: supplierInvoiceId },
    data: {
      supplierId: input.supplierId !== undefined ? input.supplierId : undefined,
      dentistId: input.dentistId !== undefined ? input.dentistId : undefined,
      amountPence: input.amountPence,
      description: input.description !== undefined ? input.description : undefined,
      invoiceNumber: input.invoiceNumber !== undefined ? input.invoiceNumber?.trim() || null : undefined,
      fileUrl: input.fileUrl !== undefined ? input.fileUrl : undefined,
      invoiceDate:
        input.invoiceDate !== undefined
          ? input.invoiceDate
            ? new Date(input.invoiceDate)
            : null
          : undefined,
      paid: input.paid,
      paidAt: input.paid === false ? null : input.paid ? (input.paidAt ?? new Date()) : undefined,
    },
  });
}

export async function deleteSupplierInvoice(practiceId: string, supplierInvoiceId: string) {
  const db = scopedDb(practiceId);
  const existing = await db.supplierInvoiceEntry.findFirst({
    where: { id: supplierInvoiceId, practiceId },
  });
  if (!existing) throw new Error("Supplier invoice not found");
  await db.supplierInvoiceEntry.delete({ where: { id: supplierInvoiceId } });
  return { ok: true };
}

export async function updateSupplierInvoicePaid(
  practiceId: string,
  supplierInvoiceId: string,
  paid: boolean,
  paidAt?: Date | null
) {
  const db = scopedDb(practiceId);
  const existing = await db.supplierInvoiceEntry.findFirst({ where: { id: supplierInvoiceId, practiceId } });
  if (!existing) throw new Error("Supplier invoice not found");

  return db.supplierInvoiceEntry.update({
    where: { id: supplierInvoiceId },
    data: { paid, paidAt: paid ? (paidAt ?? new Date()) : null },
  });
}

// ---------------------------------------------------------------------------
// Pay periods
// ---------------------------------------------------------------------------

/** §6.0 — creates the DRAFT period for "today"'s 15th-trigger (or an explicit month/year). */
export async function createPayPeriodForTrigger(practiceId: string, triggerDate: string) {
  const db = scopedDb(practiceId);
  const { startDate, endDate } = getPeriodForTriggerDate(triggerDate);
  const existing = await db.payPeriod.findFirst({
    where: { periodStart: new Date(startDate), periodEnd: new Date(endDate) },
  });
  if (existing) return existing;
  return db.payPeriod.create({
    data: {
      practiceId,
      periodStart: new Date(startDate),
      periodEnd: new Date(endDate),
      status: "DRAFT",
      triggeredAt: new Date(triggerDate),
    },
  });
}

export async function listPayPeriods(practiceId: string) {
  const db = scopedDb(practiceId);
  return db.payPeriod.findMany({ orderBy: { periodStart: "desc" } });
}

// ---------------------------------------------------------------------------
// Reporting — aggregates PayslipEntry totals per pay period (§5.15 chart data)
// ---------------------------------------------------------------------------

export interface ReportingPeriodPoint {
  payPeriodId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  nhsEarningsPence: number;
  privateEarningsPence: number;
  finalPayPence: number;
  dentistCount: number;
}

/**
 * One aggregated point per pay period, oldest-first (chart reads left-to-right
 * chronologically). Pulls every PayslipEntry across all periods in one query
 * rather than N+1'ing per period.
 */
export async function getReportingData(practiceId: string): Promise<ReportingPeriodPoint[]> {
  const db = scopedDb(practiceId);
  const periods = await db.payPeriod.findMany({
    orderBy: { periodStart: "asc" },
    include: { payslipEntries: true },
  });

  return periods.map((p) => {
    const entries = p.payslipEntries;
    const nhsEarningsPence = entries.reduce((sum, e) => sum + (e.nhsEarningsPence ?? 0), 0);
    const privateEarningsPence = entries.reduce((sum, e) => sum + (e.privateEarningsPence ?? 0), 0);
    const finalPayPence = entries.reduce((sum, e) => sum + (e.finalPayPence ?? 0), 0);
    const dentistCount = new Set(entries.map((e) => e.dentistId)).size;

    return {
      payPeriodId: p.id,
      periodStart: p.periodStart.toISOString(),
      periodEnd: p.periodEnd.toISOString(),
      status: p.status,
      nhsEarningsPence,
      privateEarningsPence,
      finalPayPence,
      dentistCount,
    };
  });
}

export async function lockPayPeriod(practiceId: string, payPeriodId: string) {
  const db = scopedDb(practiceId);
  return db.payPeriod.update({
    where: { id: payPeriodId },
    data: { status: "LOCKED", lockedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Compass statement upload -> parse -> persist PayLine rows (§6.2)
// ---------------------------------------------------------------------------

export interface CompassUploadResult {
  statementId: string;
  linesCreated: number;
  confidentCount: number;
  needsReviewCount: number;
}

export async function uploadAndParseCompassStatement(
  practiceId: string,
  payPeriodId: string,
  fileUrl: string,
  pdfBuffer: Buffer
): Promise<CompassUploadResult> {
  const db = scopedDb(practiceId);

  const dentists = await db.dentist.findMany({
    where: { nhsPerformerNumber: { not: null } },
    select: { id: true, name: true, nhsPerformerNumber: true },
  });
  const knownNamesByPerformer = new Map<string, string>();
  const dentistByPerformer = new Map<string, string>();
  for (const d of dentists) {
    if (d.nhsPerformerNumber) {
      knownNamesByPerformer.set(d.nhsPerformerNumber, d.name);
      dentistByPerformer.set(d.nhsPerformerNumber, d.id);
    }
  }

  const parsed = await parseCompassStatement(pdfBuffer, knownNamesByPerformer);

  const statement = await db.compassStatement.create({
    data: {
      practiceId,
      payPeriodId,
      fileUrl,
      contractNumber: parsed.contractNumber,
      activityPeriodStart: parsed.activityPeriodStart ? new Date(parsed.activityPeriodStart) : null,
      activityPeriodEnd: parsed.activityPeriodEnd ? new Date(parsed.activityPeriodEnd) : null,
      parsedAt: new Date(),
      status: parsed.lines.some((l) => !l.confident) ? "NEEDS_REVIEW" : "PARSED",
    },
  });

  let confidentCount = 0;
  let needsReviewCount = 0;

  for (const line of parsed.lines) {
    const dentistId = dentistByPerformer.get(line.performerNumber) ?? null;
    const confident = line.confident && !!dentistId;
    if (confident) confidentCount++;
    else needsReviewCount++;

    await db.payLine.create({
      data: {
        compassStatementId: statement.id,
        dentistId: confident ? dentistId : null,
        performerNumber: line.performerNumber,
        rawDentistName: line.rawName,
        udas: line.udas,
        superannuationPence: line.superannuationPence,
        matchConfidence: confident ? "CONFIDENT" : "NEEDS_REVIEW",
      },
    });
  }

  return {
    statementId: statement.id,
    linesCreated: parsed.lines.length,
    confidentCount,
    needsReviewCount,
  };
}

// ---------------------------------------------------------------------------
// Manual review — a correction writes an AuditLog row (§6.2 / PERMISSIONS_MATRIX §3)
// ---------------------------------------------------------------------------

export async function reviewPayLine(
  practiceId: string,
  actor: { actorUserId: string; impersonatedUserId?: string },
  payLineId: string,
  correctedDentistId: string
) {
  const db = scopedDb(practiceId);
  const before = await db.payLine.findFirst({ where: { id: payLineId } });
  if (!before) throw new Error("PayLine not found");

  const updated = await db.payLine.update({
    where: { id: payLineId },
    data: {
      dentistId: correctedDentistId,
      matchConfidence: "CONFIDENT",
      // Attributed to the REAL actor (the Super Admin during impersonation,
      // Step 2.3) — same identity as the AuditLog row below, never the
      // impersonated user, for consistent, honest attribution.
      reviewedBy: actor.actorUserId,
      reviewedAt: new Date(),
    },
  });

  // Never overwrite rawDentistName/original extracted values — this write is
  // itself the audit trail on top of the original extraction, per DATA_MODEL §3.
  await writeAuditLog({
    ...actor,
    practiceId,
    action: "pay.compass_line.manual_match",
    targetType: "PayLine",
    targetId: payLineId,
    metadata: {
      before: { dentistId: before.dentistId, matchConfidence: before.matchConfidence, rawDentistName: before.rawDentistName, performerNumber: before.performerNumber },
      after: { dentistId: updated.dentistId, matchConfidence: updated.matchConfidence },
    },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Payslip calculation (§6.3-6.5)
// ---------------------------------------------------------------------------

export async function calculatePayslipForDentist(practiceId: string, payPeriodId: string, dentistId: string) {
  const db = scopedDb(practiceId);

  const [dentist, payPeriod, existing] = await Promise.all([
    db.dentist.findFirstOrThrow({ where: { id: dentistId } }),
    db.payPeriod.findFirstOrThrow({ where: { id: payPeriodId } }),
    db.payslipEntry.findFirst({
      where: { payPeriodId, dentistId },
      include: { privateRevenueLineItems: true },
    }),
  ]);

  // Idempotency: LOCKED period — never create or recompute payslips.
  if (payPeriod.status === "LOCKED") {
    if (existing) return existing;
    throw new Error("Pay period is locked");
  }

  const { canRunPeriodCalculation } = await import("./month-pipeline");
  const gate = canRunPeriodCalculation({
    periodStatus: payPeriod.status,
    dentallyFetchStatus: payPeriod.dentallyFetchStatus,
  });
  if (!gate.ok) throw new Error(gate.error);

  const periodStartIso = payPeriod.periodStart.toISOString();
  const periodEndIso = payPeriod.periodEnd.toISOString();

  const lineItems =
    existing?.privateRevenueLineItems ??
    (await db.privateRevenueLineItem.findMany({
      where: { payslipEntry: { payPeriodId, dentistId } },
    }));

  // Step 14 — exclude lines already paid out in another period.
  const paidLogLookup = await loadPaidLogLookup(db, practiceId);
  const lineItemsForGross = lineItems.filter(
    (li) =>
      !isAlreadyPaidInOtherPeriod(
        {
          dentallyInvoiceId: li.dentallyInvoiceId,
          dentallyPatientId: li.dentallyPatientId,
          treatmentDescription: li.treatmentDescription,
          amountPence: li.amountPence,
        },
        paidLogLookup,
        payPeriodId,
        dentistId
      )
  );

  const treatments: TreatmentRecord[] = privateRevenueItemsToTreatments(
    dentistId,
    lineItemsForGross,
    periodStartIso
  );

  const paySettings = await getPaySettings(practiceId);
  const practiceLabBp = resolveLabBillSplit(paySettings);
  const practiceFinanceBp = resolveFinanceFeeSplit(paySettings);

  const rateHistory = await db.dentistRateHistory.findMany({
    where: { dentistId },
    orderBy: { effectiveFrom: "desc" },
  });
  const rates = resolveDentistRatesAsOf(
    {
      privateSplitPercent: dentist.privateSplitPercent != null ? Number(dentist.privateSplitPercent) : null,
      udaRatePence: dentist.udaRatePence,
      hourlyRatePence: dentist.hourlyRatePence,
      labShareBp: dentist.labShareBp,
      financeShareBp: dentist.financeShareBp,
      therapyHourlyPence: dentist.therapyHourlyPence,
    },
    rateHistory.map((h) => ({
      effectiveFrom: h.effectiveFrom,
      privateSplitPercent: h.privateSplitPercent != null ? Number(h.privateSplitPercent) : null,
      udaRatePence: h.udaRatePence,
      hourlyRatePence: h.hourlyRatePence,
      labShareBp: h.labShareBp,
      financeShareBp: h.financeShareBp,
      therapyHourlyPence: h.therapyHourlyPence,
    })),
    periodRatesAsOfDate(payPeriod.periodEnd)
  );
  const labBillSplit = resolveShareBp(rates.labShareBp, practiceLabBp);
  const financeFeeSplit = resolveShareBp(rates.financeShareBp, practiceFinanceBp);

  const fromPayslipLabs = labBillAmountsPenceFromPayslipJson(existing?.labBillsJson);
  let labAmounts: number[];
  let syncedLabBillsJson: ReturnType<typeof labBillEntriesToPayslipJson> | undefined;
  if (fromPayslipLabs != null) {
    // Explicit payslip JSON (including []) — do not re-import LabBillEntry.
    labAmounts = fromPayslipLabs;
  } else {
    const labEntries = await db.labBillEntry.findMany({
      where: labBillPeriodWhere(dentistId, payPeriod.periodStart),
      select: { labName: true, amountPence: true, description: true, fileUrl: true },
    });
    labAmounts = labEntries.map((e) => e.amountPence).filter((n) => n > 0);
    if (labEntries.length > 0) {
      syncedLabBillsJson = labBillEntriesToPayslipJson(labEntries);
    }
  }
  const labDeductionPence = calculateLabDeduction(labAmounts, labBillSplit);

  const payLine = await db.payLine.findFirst({
    where: { dentistId, compassStatement: { payPeriodId }, matchConfidence: "CONFIDENT" },
    orderBy: { createdAt: "desc" },
  });

  if (dentist.payType === "PERCENTAGE_SPLIT") {
    const splitPercent = rates.privateSplitPercent ?? 0;
    const earnings = calculatePrivateEarnings(dentistId, treatments, periodStartIso, periodEndIso, splitPercent);
    const nhs = resolveNhsUdasForCalc(
      { nhsPerformerNumber: dentist.nhsPerformerNumber, udaRatePence: rates.udaRatePence },
      payLine?.udas ? Number(payLine.udas) : 0
    );
    const { udas, udaRatePence, nhsEarningsPence } = nhs;
    const superannuationPence = dentist.nhsPerformerNumber?.trim() ? (payLine?.superannuationPence ?? 0) : 0;
    const therapyDeduction = therapyDeductionPence(
      existing?.therapyMinutes != null ? Number(existing.therapyMinutes) : 0,
      existing?.therapyRatePerMinute != null ? Number(existing.therapyRatePerMinute) : 0,
      rates.therapyHourlyPence
    );
    const financeDeduction = financeFeesDeductionPence(
      resolveFinanceFeesForDeduction(lineItems, paySettings),
      financeFeeSplit
    );
    const provisional = payslipIsProvisional(lineItems);

    const finalPayPence = calculateFinalPay({
      payType: "PERCENTAGE_SPLIT",
      udas,
      udaRatePence,
      grossPrivateRevenuePence: earnings.grossPrivateRevenuePence,
      privateSplitPercent: splitPercent,
      privateEarningsPence: earnings.privateEarningsPence,
      consultationExclusionsPence: earnings.consultationExclusionsPence,
      labDeductionPence,
      superannuationPence,
      therapyDeductionPence: therapyDeduction,
      financeFeesDeductionPence: financeDeduction,
    });

    const data = {
      practiceId,
      payPeriodId,
      dentistId,
      payType: "PERCENTAGE_SPLIT" as const,
      udas,
      udaRatePence,
      nhsEarningsPence,
      grossPrivateRevenuePence: earnings.grossPrivateRevenuePence,
      privateSplitPercent: splitPercent,
      privateEarningsPence: earnings.privateEarningsPence,
      consultationExclusionsPence: earnings.consultationExclusionsPence,
      labDeductionPence,
      superannuationPence,
      finalPayPence,
      provisional,
      ...(syncedLabBillsJson
        ? { labBillsJson: syncedLabBillsJson as unknown as object }
        : {}),
    };

    const entry = await db.payslipEntry.upsert({
      where: { payPeriodId_dentistId: { payPeriodId, dentistId } },
      update: data,
      create: data,
    });

    // Step 32 — never seed bare untraced plugs. Dentally/manual lines come from
    // fetch or patients/calc note paths only.

    // Step 14 — append newly paid-out Dentally lines to PaidInvoiceLineLog.
    await upsertPaidLogEntries(
      db,
      practiceId,
      payPeriodId,
      dentistId,
      lineItemsForGross.filter((li) => lineCountsTowardGross(li))
    );

    return entry;
  }

  // HOURLY
  const hourEntries = await db.hourEntry.findMany({ where: { dentistId, payPeriodId } });
  const hoursWorked = hourEntries.reduce((sum, h) => sum + Number(h.hours), 0);
  const hourlyRatePence = rates.hourlyRatePence ?? 0;
  const finalPayPence = calculateFinalPay({ payType: "HOURLY", hoursWorked, hourlyRatePence });

  const data = {
    practiceId,
    payPeriodId,
    dentistId,
    payType: "HOURLY" as const,
    hoursWorked,
    hourlyRatePence,
    hourlyEarningsPence: Math.round(hoursWorked * hourlyRatePence),
    finalPayPence,
  };

  // F.1 Final QA money-path audit (2026-08-29): same upsert fix as the
  // PERCENTAGE_SPLIT branch above — see its comment for the full rationale.
  return db.payslipEntry.upsert({
    where: { payPeriodId_dentistId: { payPeriodId, dentistId } },
    update: data,
    create: data,
  });
}

/** Editable payslip fields saved without a full-period recalculate (legacy PUT /periods/entries, Y2.1a). */
export interface SavePayslipEntryInput {
  payslipEntryId: string;
  udas?: number;
  grossPrivateRevenuePence?: number;
  privateEarningsPence?: number;
  consultationExclusionsPence?: number;
  labDeductionPence?: number;
  superannuationPence?: number;
  therapyMinutes?: number;
  therapyRatePerMinute?: number | null;
  manualAdjustmentsPence?: number;
  adjustmentReason?: string | null;
  hoursWorked?: number;
  hourlyEarningsPence?: number;
  /** Override finance fee deduction when not derived from line items (legacy finance_fees). */
  financeFeesPence?: number;
  dentallyPatientsJson?: unknown;
  dentallyDiscrepanciesJson?: unknown;
  labBillsJson?: unknown;
  adjustmentsJson?: unknown;
}

export async function savePayslipEntry(
  practiceId: string,
  payPeriodId: string,
  input: SavePayslipEntryInput
) {
  const db = scopedDb(practiceId);
  const payPeriod = await db.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found");
  if (payPeriod.status === "LOCKED") throw new Error("Pay period is locked");

  const existing = await db.payslipEntry.findFirst({
    where: { id: input.payslipEntryId, payPeriodId, practiceId },
    include: { privateRevenueLineItems: true },
  });
  if (!existing) throw new Error("Payslip not found");

  const dentist = await db.dentist.findUnique({ where: { id: existing.dentistId } });
  if (!dentist) throw new Error("Dentist not found");

  const rateHistory = await db.dentistRateHistory.findMany({
    where: { dentistId: dentist.id },
    orderBy: { effectiveFrom: "desc" },
  });
  const rates = resolveDentistRatesAsOf(
    {
      privateSplitPercent: dentist.privateSplitPercent != null ? Number(dentist.privateSplitPercent) : null,
      udaRatePence: dentist.udaRatePence,
      hourlyRatePence: dentist.hourlyRatePence,
      labShareBp: dentist.labShareBp,
      financeShareBp: dentist.financeShareBp,
      therapyHourlyPence: dentist.therapyHourlyPence,
    },
    rateHistory.map((h) => ({
      effectiveFrom: h.effectiveFrom,
      privateSplitPercent: h.privateSplitPercent != null ? Number(h.privateSplitPercent) : null,
      udaRatePence: h.udaRatePence,
      hourlyRatePence: h.hourlyRatePence,
      labShareBp: h.labShareBp,
      financeShareBp: h.financeShareBp,
      therapyHourlyPence: h.therapyHourlyPence,
    })),
    periodRatesAsOfDate(payPeriod.periodEnd)
  );

  const paySettings = await getPaySettings(practiceId);
  const financeFeeSplit = resolveShareBp(
    rates.financeShareBp,
    resolveFinanceFeeSplit(paySettings)
  );
  const isNhs = Boolean(dentist.nhsPerformerNumber?.trim());

  const udasRaw = input.udas ?? (existing.udas != null ? Number(existing.udas) : 0);
  const udas = isNhs && Number.isFinite(udasRaw) && udasRaw > 0 ? udasRaw : 0;
  const udaRatePence = isNhs ? (existing.udaRatePence ?? rates.udaRatePence ?? 0) : 0;
  const nhsEarningsPence = Math.round(udas * udaRatePence);
  const grossPrivateRevenuePence = input.grossPrivateRevenuePence ?? existing.grossPrivateRevenuePence ?? 0;
  const privateSplitPercent =
    existing.privateSplitPercent != null
      ? Number(existing.privateSplitPercent)
      : Number(rates.privateSplitPercent ?? dentist.privateSplitPercent ?? 0);
  // When gross changes without an explicit privateEarnings override, recompute net private.
  const privateEarningsPence =
    input.privateEarningsPence != null
      ? input.privateEarningsPence
      : input.grossPrivateRevenuePence != null
        ? Math.round(grossPrivateRevenuePence * (privateSplitPercent / 100))
        : (existing.privateEarningsPence ??
          Math.round(grossPrivateRevenuePence * (privateSplitPercent / 100)));
  const consultationExclusionsPence = input.consultationExclusionsPence ?? existing.consultationExclusionsPence ?? 0;
  const labDeductionPence = input.labDeductionPence ?? existing.labDeductionPence ?? 0;
  const superannuationPence = isNhs
    ? (input.superannuationPence ?? existing.superannuationPence ?? 0)
    : 0;
  const therapyMinutes = input.therapyMinutes ?? (existing.therapyMinutes != null ? Number(existing.therapyMinutes) : 0);
  const therapyRatePerMinute =
    input.therapyRatePerMinute !== undefined
      ? input.therapyRatePerMinute
      : existing.therapyRatePerMinute != null
        ? Number(existing.therapyRatePerMinute)
        : null;
  const manualAdjustmentsPence = input.manualAdjustmentsPence ?? existing.manualAdjustmentsPence ?? 0;
  const adjustmentReason = input.adjustmentReason !== undefined ? input.adjustmentReason : existing.adjustmentReason;

  if (existing.payType === "HOURLY") {
    const hoursWorked = input.hoursWorked ?? (existing.hoursWorked != null ? Number(existing.hoursWorked) : 0);
    const hourlyRatePence = existing.hourlyRatePence ?? rates.hourlyRatePence ?? 0;
    const hourlyEarningsPence = input.hourlyEarningsPence ?? Math.round(hoursWorked * hourlyRatePence);
    const finalPayPence = calculateFinalPay({
      payType: "HOURLY",
      hoursWorked,
      hourlyRatePence,
      manualAdjustmentsPence,
    });
    return db.payslipEntry.update({
      where: { id: existing.id },
      data: {
        hoursWorked,
        hourlyRatePence,
        hourlyEarningsPence,
        manualAdjustmentsPence,
        adjustmentReason,
        finalPayPence,
      },
    });
  }

  const therapyDeduction = therapyDeductionPence(
    therapyMinutes,
    therapyRatePerMinute,
    rates.therapyHourlyPence
  );
  const financeDeduction =
    input.financeFeesPence != null
      ? financeFeesDeductionPence([{ financeFeePence: input.financeFeesPence }], financeFeeSplit)
      : financeFeesDeductionPence(
          resolveFinanceFeesForDeduction(existing.privateRevenueLineItems, paySettings),
          financeFeeSplit
        );
  const provisional = payslipIsProvisional(existing.privateRevenueLineItems);

  const finalPayPence = calculateFinalPay({
    payType: "PERCENTAGE_SPLIT",
    udas,
    udaRatePence,
    grossPrivateRevenuePence,
    privateSplitPercent,
    privateEarningsPence,
    consultationExclusionsPence,
    labDeductionPence,
    superannuationPence,
    therapyDeductionPence: therapyDeduction,
    financeFeesDeductionPence: financeDeduction,
    manualAdjustmentsPence,
  });

  return db.payslipEntry.update({
    where: { id: existing.id },
    data: {
      udas,
      udaRatePence,
      nhsEarningsPence,
      grossPrivateRevenuePence,
      privateSplitPercent,
      privateEarningsPence,
      consultationExclusionsPence,
      labDeductionPence,
      superannuationPence,
      therapyMinutes,
      therapyRatePerMinute,
      manualAdjustmentsPence,
      adjustmentReason,
      finalPayPence,
      provisional,
      ...(input.dentallyPatientsJson !== undefined ? { dentallyPatientsJson: input.dentallyPatientsJson as object } : {}),
      ...(input.dentallyDiscrepanciesJson !== undefined
        ? { dentallyDiscrepanciesJson: input.dentallyDiscrepanciesJson as object }
        : {}),
      ...(input.labBillsJson !== undefined ? { labBillsJson: input.labBillsJson as object } : {}),
      ...(input.adjustmentsJson !== undefined ? { adjustmentsJson: input.adjustmentsJson as object } : {}),
    },
  });
}

export async function listPayslipEntriesForPeriod(
  practiceId: string,
  payPeriodId: string,
  dentistId?: string | null
) {
  const db = scopedDb(practiceId);
  return db.payslipEntry.findMany({
    where: {
      practiceId,
      payPeriodId,
      ...(dentistId ? { dentistId } : {}),
    },
    include: {
      dentist: { select: { id: true, name: true, payType: true, privateSplitPercent: true } },
      privateRevenueLineItems: { orderBy: [{ invoiceDate: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { dentist: { name: "asc" } },
  });
}
