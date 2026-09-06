import { calculateLabDeduction } from "@elio/pay-engine";
import type { SavePayslipEntryInput } from "./pay-service";
import {
  parsePayslipAdjustments,
  prepareAdjustmentsForSave,
  sumAdjustmentsToManualPence,
  validatePayslipAdjustments,
} from "./payslip-editable-fields";

type LegacyAdjustment = {
  description?: string;
  note?: string;
  amount?: number;
  amountPence?: number;
  type?: "addition" | "deduction";
  createdBy?: string;
  createdAt?: string;
};
type LegacyLabBill = { amount?: number };
type LegacyPrivatePatient = {
  amount?: number;
  amountPaid?: number;
  finance?: boolean;
  financeFee?: number;
};

function poundsToPence(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

export function sumLegacyAdjustmentsPence(adjustments: LegacyAdjustment[] | undefined): number | undefined {
  if (!adjustments?.length) return undefined;
  const parsed = parsePayslipAdjustments(adjustments);
  return sumAdjustmentsToManualPence(parsed);
}

export function labBillsDeductionPence(
  labBills: LegacyLabBill[] | undefined,
  labShareRate = 0.5
): number | undefined {
  if (!labBills?.length) return undefined;
  const billPence = labBills.map((b) => poundsToPence(b.amount) ?? 0);
  return calculateLabDeduction(billPence, labShareRate);
}

export function totalsFromLegacyPatients(patients: LegacyPrivatePatient[] | undefined): {
  grossPrivateRevenuePence?: number;
  financeFeesPence?: number;
} {
  if (!patients?.length) return {};
  let grossPence = 0;
  let financeFeesPence = 0;
  for (const p of patients) {
    grossPence += poundsToPence(p.amountPaid ?? p.amount) ?? 0;
    if (p.finance && p.financeFee != null) {
      financeFeesPence += poundsToPence(p.financeFee) ?? 0;
    }
  }
  return { grossPrivateRevenuePence: grossPence, financeFeesPence };
}

export class PayslipAdjustmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayslipAdjustmentValidationError";
  }
}

/** Accept legacy AuraPay PUT body keys alongside new ELIO camelCase fields (Y2.1a / Step 27). */
export function normalizeSavePayslipEntryInput(
  body: Record<string, unknown>,
  opts?: { labBillSplit?: number; actorUserId?: string }
): SavePayslipEntryInput {
  const payslipEntryId = String(body.payslipEntryId ?? body.id ?? "");
  const rawAdjustments = (body.adjustments ?? body.adjustmentsJson ?? body.adjustments_json) as
    | LegacyAdjustment[]
    | undefined;
  const labBills = body.lab_bills as LegacyLabBill[] | undefined;
  const privatePatients = body.private_patients as LegacyPrivatePatient[] | undefined;
  const patientTotals = totalsFromLegacyPatients(privatePatients);
  const labShare = opts?.labBillSplit ?? 0.5;

  let adjustmentsJson: unknown = rawAdjustments;
  let manualFromAdj: number | undefined;
  if (rawAdjustments != null) {
    const parsed = parsePayslipAdjustments(rawAdjustments);
    const err = validatePayslipAdjustments(parsed);
    if (err) throw new PayslipAdjustmentValidationError(err);
    const stamped = prepareAdjustmentsForSave(parsed, opts?.actorUserId ?? "system");
    adjustmentsJson = stamped;
    manualFromAdj = sumAdjustmentsToManualPence(stamped);
  }

  return {
    payslipEntryId,
    udas: body.udas != null ? Number(body.udas) : body.nhs_udas != null ? Number(body.nhs_udas) : undefined,
    grossPrivateRevenuePence:
      body.grossPrivateRevenuePence != null
        ? Number(body.grossPrivateRevenuePence)
        : patientTotals.grossPrivateRevenuePence ?? poundsToPence(body.gross_private),
    privateEarningsPence: body.privateEarningsPence != null ? Number(body.privateEarningsPence) : undefined,
    consultationExclusionsPence:
      body.consultationExclusionsPence != null ? Number(body.consultationExclusionsPence) : undefined,
    labDeductionPence:
      body.labDeductionPence != null
        ? Number(body.labDeductionPence)
        : labBillsDeductionPence(labBills, labShare),
    superannuationPence:
      body.superannuationPence != null
        ? Number(body.superannuationPence)
        : poundsToPence(body.superannuation_deduction),
    therapyMinutes:
      body.therapyMinutes != null
        ? Number(body.therapyMinutes)
        : body.therapy_minutes != null
          ? Number(body.therapy_minutes)
          : undefined,
    therapyRatePerMinute:
      body.therapyRatePerMinute === null || body.therapy_rate === null
        ? null
        : body.therapyRatePerMinute != null
          ? Number(body.therapyRatePerMinute)
          : body.therapy_rate != null && body.therapy_rate !== ""
            ? Number(body.therapy_rate)
            : undefined,
    manualAdjustmentsPence:
      body.manualAdjustmentsPence != null
        ? Number(body.manualAdjustmentsPence)
        : manualFromAdj,
    adjustmentReason:
      typeof body.adjustmentReason === "string"
        ? body.adjustmentReason
        : typeof body.notes === "string"
          ? body.notes
          : undefined,
    hoursWorked: body.hoursWorked != null ? Number(body.hoursWorked) : undefined,
    hourlyEarningsPence: body.hourlyEarningsPence != null ? Number(body.hourlyEarningsPence) : undefined,
    financeFeesPence:
      body.financeFeesPence != null
        ? Number(body.financeFeesPence)
        : patientTotals.financeFeesPence ?? poundsToPence(body.finance_fees),
    dentallyPatientsJson: privatePatients ?? body.dentallyPatientsJson,
    dentallyDiscrepanciesJson: body.discrepancies ?? body.dentallyDiscrepanciesJson,
    labBillsJson: labBills ?? body.labBillsJson ?? body.lab_bills_json,
    adjustmentsJson,
  };
}
