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

// ---------------------------------------------------------------------------
// Dentists
// ---------------------------------------------------------------------------

export async function listDentists(practiceId: string) {
  const db = scopedDb(practiceId);
  return db.dentist.findMany({ orderBy: { name: "asc" } });
}

export interface CreateDentistInput {
  name: string;
  nhsPerformerNumber?: string | null;
  payType: "PERCENTAGE_SPLIT" | "HOURLY";
  privateSplitPercent?: number | null;
  udaRatePence?: number | null;
  hourlyRatePence?: number | null;
}

export async function createDentist(practiceId: string, input: CreateDentistInput) {
  const db = scopedDb(practiceId);
  return db.dentist.create({
    data: {
      practiceId,
      name: input.name,
      nhsPerformerNumber: input.nhsPerformerNumber ?? null,
      payType: input.payType,
      privateSplitPercent: input.privateSplitPercent ?? null,
      udaRatePence: input.udaRatePence ?? null,
      hourlyRatePence: input.hourlyRatePence ?? null,
      effectiveFrom: new Date(),
    },
  });
}

/**
 * §6.1 rate/split versioning: a rate change is a NEW row's `effectiveFrom`,
 * never an in-place mutation of an already-locked payslip's inputs. Since
 * `PayslipEntry` copies every source figure at calc time (not derived at
 * read-time — DATA_MODEL.md §3), simply updating the Dentist's current rate
 * here is safe: existing PayslipEntry rows never re-read this table.
 */
export async function updateDentistRate(
  practiceId: string,
  dentistId: string,
  patch: Partial<Pick<CreateDentistInput, "privateSplitPercent" | "udaRatePence" | "hourlyRatePence">>
) {
  const db = scopedDb(practiceId);
  return db.dentist.update({
    where: { id: dentistId },
    data: { ...patch, effectiveFrom: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Lab bills
// ---------------------------------------------------------------------------

export async function listLabBills(practiceId: string, dentistId?: string) {
  const db = scopedDb(practiceId);
  return db.labBillEntry.findMany({
    where: dentistId ? { dentistId } : undefined,
    include: { dentist: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export interface CreateLabBillInput {
  dentistId?: string | null;
  amountPence: number;
  description?: string | null;
}

export async function createLabBill(practiceId: string, input: CreateLabBillInput) {
  const db = scopedDb(practiceId);
  return db.labBillEntry.create({
    data: {
      practiceId,
      dentistId: input.dentistId ?? null,
      amountPence: input.amountPence,
      description: input.description ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Supplier invoices
// ---------------------------------------------------------------------------

export async function listSupplierInvoices(practiceId: string, supplierName?: string) {
  const db = scopedDb(practiceId);
  return db.supplierInvoiceEntry.findMany({
    where: supplierName ? { supplier: { name: { contains: supplierName, mode: "insensitive" } } } : undefined,
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export interface CreateSupplierInvoiceInput {
  supplierId?: string | null;
  amountPence: number;
  description?: string | null;
  invoiceDate?: string | null;
}

export async function createSupplierInvoice(practiceId: string, input: CreateSupplierInvoiceInput) {
  const db = scopedDb(practiceId);
  return db.supplierInvoiceEntry.create({
    data: {
      practiceId,
      supplierId: input.supplierId ?? null,
      amountPence: input.amountPence,
      description: input.description ?? null,
      invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
    },
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
    db.payslipEntry.findFirst({ where: { payPeriodId, dentistId } }),
  ]);

  // Idempotency (DATA_MODEL §3): a LOCKED period's PayslipEntry rows are read,
  // never recomputed.
  if (existing && payPeriod.status === "LOCKED") return existing;

  const periodStartIso = payPeriod.periodStart.toISOString();
  const periodEndIso = payPeriod.periodEnd.toISOString();

  // §6.3 — private earnings from this dentist's actually-completed treatment
  // strictly inside the exact calendar-month period.
  //
  // KNOWN GAP (flagged, not silently worked around — see final report): the
  // dentally_treatments table (packages/db schema) has no `dentistId` column
  // and no treatment-category/code field, so a real Treatment row cannot yet
  // be attributed to the clinician who performed it, nor reliably flagged as
  // a cosmetic consultation via anything but a free-text description (which
  // §6.3 explicitly forbids). Until that sync gap is closed, treatments are
  // read here but yield an empty attributable set for a real Dentally pull —
  // seed-data verification instead constructs TreatmentRecord[] directly
  // (bypassing the unlinked Treatment table) to prove the pay-calc math.
  const treatments: TreatmentRecord[] = [];

  const lab = await db.labBillEntry.aggregate({
    where: { dentistId },
    _sum: { amountPence: true },
  });
  const labDeductionPence = calculateLabDeduction([lab._sum.amountPence ?? 0]);

  // Latest confident PayLine for this dentist within this period's Compass statements.
  const payLine = await db.payLine.findFirst({
    where: { dentistId, compassStatement: { payPeriodId } },
    orderBy: { createdAt: "desc" },
  });

  if (dentist.payType === "PERCENTAGE_SPLIT") {
    const splitPercent = Number(dentist.privateSplitPercent ?? 0);
    const earnings = calculatePrivateEarnings(dentistId, treatments, periodStartIso, periodEndIso, splitPercent);
    const udas = payLine?.udas ? Number(payLine.udas) : 0;
    const udaRatePence = dentist.udaRatePence ?? 0;
    const superannuationPence = payLine?.superannuationPence ?? 0;

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
    });

    const data = {
      practiceId,
      payPeriodId,
      dentistId,
      payType: "PERCENTAGE_SPLIT" as const,
      udas,
      udaRatePence,
      nhsEarningsPence: Math.round(udas * udaRatePence),
      grossPrivateRevenuePence: earnings.grossPrivateRevenuePence,
      privateSplitPercent: splitPercent,
      privateEarningsPence: earnings.privateEarningsPence,
      consultationExclusionsPence: earnings.consultationExclusionsPence,
      labDeductionPence,
      superannuationPence,
      finalPayPence,
    };

    const entry = existing
      ? await db.payslipEntry.update({ where: { id: existing.id }, data })
      : await db.payslipEntry.create({ data });

    if (!existing) {
      for (const li of earnings.lineItems) {
        await db.privateRevenueLineItem.create({
          data: {
            payslipEntryId: entry.id,
            treatmentId: li.treatmentId,
            amountPence: li.amountPence,
            excludedAsConsultation: li.excludedAsConsultation,
          },
        });
      }
    }
    return entry;
  }

  // HOURLY
  const hourEntry = await db.hourEntry.findFirst({ where: { dentistId, payPeriodId }, orderBy: { createdAt: "desc" } });
  const hoursWorked = hourEntry ? Number(hourEntry.hours) : 0;
  const hourlyRatePence = dentist.hourlyRatePence ?? 0;
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

  return existing
    ? db.payslipEntry.update({ where: { id: existing.id }, data })
    : db.payslipEntry.create({ data });
}
