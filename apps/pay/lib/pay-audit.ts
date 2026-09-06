import { writeAuditLog, resolveAuditActor } from "@elio/auth/lib/audit-log";

/** Step 31 — actor/time/entity/before/after/reason audit events for pay mutations. */
export type PayAuditActor = {
  userId: string;
  practiceId: string;
  impersonating?: boolean;
  actualUserId?: string;
};

export type PayAuditEvent = {
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
};

export type DentistRateSnapshot = {
  privateSplitPercent: number | null;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
  labShareBp: number | null;
  financeShareBp: number | null;
  therapyHourlyPence: number | null;
};

export function dentistRateSnapshot(d: {
  privateSplitPercent?: unknown;
  udaRatePence?: number | null;
  hourlyRatePence?: number | null;
  labShareBp?: number | null;
  financeShareBp?: number | null;
  therapyHourlyPence?: number | null;
}): DentistRateSnapshot {
  return {
    privateSplitPercent:
      d.privateSplitPercent != null && d.privateSplitPercent !== ""
        ? Number(d.privateSplitPercent)
        : null,
    udaRatePence: d.udaRatePence ?? null,
    hourlyRatePence: d.hourlyRatePence ?? null,
    labShareBp: d.labShareBp ?? null,
    financeShareBp: d.financeShareBp ?? null,
    therapyHourlyPence: d.therapyHourlyPence ?? null,
  };
}

export function dentistRatesChanged(before: DentistRateSnapshot, after: DentistRateSnapshot): boolean {
  return (
    before.privateSplitPercent !== after.privateSplitPercent ||
    before.udaRatePence !== after.udaRatePence ||
    before.hourlyRatePence !== after.hourlyRatePence ||
    before.labShareBp !== after.labShareBp ||
    before.financeShareBp !== after.financeShareBp ||
    before.therapyHourlyPence !== after.therapyHourlyPence
  );
}

/** Step 31 testing: split/rate change → `pay.dentist.rates_updated`. */
export function dentistRatesUpdatedEvent(
  dentistId: string,
  before: DentistRateSnapshot,
  after: DentistRateSnapshot,
  reason?: string | null
): PayAuditEvent | null {
  if (!dentistRatesChanged(before, after)) return null;
  return {
    action: "pay.dentist.rates_updated",
    targetType: "Dentist",
    targetId: dentistId,
    metadata: {
      before,
      after,
      ...(reason ? { reason } : {}),
    },
  };
}

export type PayslipEditableSnapshot = {
  udas: number | null;
  therapyMinutes: number | null;
  manualAdjustmentsPence: number | null;
  adjustmentsJson: unknown;
};

export function payslipEditAuditEvents(
  payslipEntryId: string,
  before: PayslipEditableSnapshot,
  after: PayslipEditableSnapshot,
  touched: { udas?: boolean; therapyMinutes?: boolean; adjustments?: boolean }
): PayAuditEvent[] {
  const events: PayAuditEvent[] = [];

  if (touched.udas && before.udas !== after.udas) {
    events.push({
      action: "pay.payslip.udas_updated",
      targetType: "PayslipEntry",
      targetId: payslipEntryId,
      metadata: { before: { udas: before.udas }, after: { udas: after.udas } },
    });
  }

  if (touched.therapyMinutes && before.therapyMinutes !== after.therapyMinutes) {
    events.push({
      action: "pay.payslip.therapy_minutes_updated",
      targetType: "PayslipEntry",
      targetId: payslipEntryId,
      metadata: {
        before: { therapyMinutes: before.therapyMinutes },
        after: { therapyMinutes: after.therapyMinutes },
      },
    });
  }

  if (touched.adjustments) {
    events.push({
      action: "pay.payslip.adjustments_updated",
      targetType: "PayslipEntry",
      targetId: payslipEntryId,
      metadata: {
        before: {
          manualAdjustmentsPence: before.manualAdjustmentsPence,
          adjustmentsJson: before.adjustmentsJson,
        },
        after: {
          manualAdjustmentsPence: after.manualAdjustmentsPence,
          adjustmentsJson: after.adjustmentsJson,
        },
      },
    });
  }

  return events;
}

export type FinanceLineSnapshot = {
  financeTermMonths: number | null;
  financeFeePence: number | null;
  financeFeeManual: boolean;
  isFinance: boolean;
};

export function financeLineChanged(before: FinanceLineSnapshot, after: FinanceLineSnapshot): boolean {
  return (
    before.financeTermMonths !== after.financeTermMonths ||
    before.financeFeePence !== after.financeFeePence ||
    before.financeFeeManual !== after.financeFeeManual ||
    before.isFinance !== after.isFinance
  );
}

export function financeLineUpdatedEvent(
  lineItemId: string,
  before: FinanceLineSnapshot,
  after: FinanceLineSnapshot,
  reason?: string | null
): PayAuditEvent | null {
  if (!financeLineChanged(before, after)) return null;
  return {
    action: "pay.private_line.finance_updated",
    targetType: "PrivateRevenueLineItem",
    targetId: lineItemId,
    metadata: {
      before,
      after,
      ...(reason ? { reason } : {}),
    },
  };
}

export async function recordPayAudit(actor: PayAuditActor, event: PayAuditEvent): Promise<void> {
  await writeAuditLog({
    ...resolveAuditActor(actor),
    practiceId: actor.practiceId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
  });
}

export async function recordPayAudits(actor: PayAuditActor, events: PayAuditEvent[]): Promise<void> {
  for (const event of events) {
    await recordPayAudit(actor, event);
  }
}
