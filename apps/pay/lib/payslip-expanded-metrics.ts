import { financeFeesDeductionPence, therapyDeductionPence } from "./private-revenue";

export interface PayslipExpandedMetricsInput {
  grossPrivateRevenuePence: number | null;
  privateEarningsPence: number | null;
  nhsEarningsPence: number | null;
  labDeductionPence: number | null;
  superannuationPence: number | null;
  therapyMinutes: number | null;
  therapyRatePerMinute: number | null;
  financeLines: Array<{ financeFeePence?: number | null }>;
  financeFeeSplit?: number;
}

export interface PayslipExpandedMetrics {
  grossPrivatePence: number;
  netPrivatePence: number;
  nhsIncomePence: number;
  labDeductionPence: number;
  superannuationDeductionPence: number;
  therapyDeductionPence: number;
  financeFeesDeductionPence: number;
  totalDeductionsPence: number;
  therapyMinutes: number;
}

/** Legacy Y2.4 quick-summary + deductions breakdown inputs. */
export function computePayslipExpandedMetrics(input: PayslipExpandedMetricsInput): PayslipExpandedMetrics {
  const grossPrivatePence = input.grossPrivateRevenuePence ?? 0;
  const netPrivatePence = input.privateEarningsPence ?? 0;
  const nhsIncomePence = input.nhsEarningsPence ?? 0;
  const labDeductionPence = input.labDeductionPence ?? 0;
  const superannuationDeductionPence = input.superannuationPence ?? 0;
  const therapyDeduction = therapyDeductionPence(input.therapyMinutes, input.therapyRatePerMinute);
  const financeFeesDeduction = financeFeesDeductionPence(input.financeLines, input.financeFeeSplit ?? 0.5);
  const therapyMinutes = input.therapyMinutes ?? 0;

  return {
    grossPrivatePence,
    netPrivatePence,
    nhsIncomePence,
    labDeductionPence,
    superannuationDeductionPence,
    therapyDeductionPence: therapyDeduction,
    financeFeesDeductionPence: financeFeesDeduction,
    totalDeductionsPence: labDeductionPence + superannuationDeductionPence + therapyDeduction + financeFeesDeduction,
    therapyMinutes,
  };
}
