/**
 * Step 35 — anonymized golden-month fixture (penny-exact CI).
 * Names/ids are fake; figures encode locked PDF rules (Steps 20–23, 33).
 */

import {
  calculateFinalPay,
  calculateLabDeduction,
  GROSS_PRIVATE_THERAPIST_PENCE,
  resolveGrossTotalPence,
} from "@elio/pay-engine";
import { financeFeesDeductionPence, therapyDeductionPence } from "./private-revenue";
import {
  resolveFinanceRateBpForTerm,
  suggestFinanceFeePence,
  type FinanceTermMonths,
} from "./finance-fee";

export type GoldenDentistFixture = {
  id: string;
  name: string;
  privateSplitPercent: number;
  udaRatePence: number;
  udas: number;
  grossPrivatePence: number;
  labBillsPence: number[];
  financeLines: Array<{ amountPence: number; termMonths: FinanceTermMonths }>;
  therapyMinutes: number;
  therapyHourlyPence: number;
  superannuationPence: number;
  manualAdjustmentsPence: number;
  expectedFinalPayPence: number;
};

const FINANCE_RATES = {
  finance_rate_3m: "0.045",
  finance_rate_12m: "0.09",
  finance_rate_36m: "0.15",
  finance_rate_60m: "0.20",
};

/** May-style golden month — two associates, penny-exact. */
export const GOLDEN_MONTH_DENTISTS: GoldenDentistFixture[] = [
  {
    id: "gd-alpha",
    name: "Dr Alpha",
    privateSplitPercent: 50,
    udaRatePence: 2800,
    udas: 100,
    grossPrivatePence: 100_000,
    labBillsPence: [20_000],
    financeLines: [{ amountPence: 80_000, termMonths: 12 }],
    therapyMinutes: 60,
    therapyHourlyPence: 3500,
    superannuationPence: 5_000,
    manualAdjustmentsPence: 0,
    // NHS 280000 + private 50000 − lab 10000 − super 5000 − therapy 3500 − finance 3600
    expectedFinalPayPence: 307_900,
  },
  {
    id: "gd-beta",
    name: "Dr Beta",
    privateSplitPercent: 55,
    udaRatePence: 1500,
    udas: 0,
    grossPrivatePence: 200_000,
    labBillsPence: [10_000, 4_000],
    financeLines: [],
    therapyMinutes: 0,
    therapyHourlyPence: 3500,
    superannuationPence: 0,
    manualAdjustmentsPence: 2_500,
    // private 110000 − lab 7000 + adj 2500
    expectedFinalPayPence: 105_500,
  },
];

export function computeGoldenDentistFinalPayPence(d: GoldenDentistFixture): number {
  if (GROSS_PRIVATE_THERAPIST_PENCE !== 0) {
    throw new Error("Step 33 violated: therapist gross must be 0");
  }
  const grossTotal = resolveGrossTotalPence(d.grossPrivatePence);
  const privateEarningsPence = Math.round((grossTotal * d.privateSplitPercent) / 100);
  const labDeductionPence = calculateLabDeduction(d.labBillsPence, 5000);
  const financeFeeLines = d.financeLines.map((line) => {
    const rateBp = resolveFinanceRateBpForTerm(FINANCE_RATES, line.termMonths);
    return {
      financeFeePence: suggestFinanceFeePence(line.amountPence, rateBp),
    };
  });
  const financeFeesDeduction = financeFeesDeductionPence(financeFeeLines, 5000);
  const therapyDeduction = therapyDeductionPence(d.therapyMinutes, null, d.therapyHourlyPence);

  return calculateFinalPay({
    payType: "PERCENTAGE_SPLIT",
    udas: d.udas,
    udaRatePence: d.udaRatePence,
    grossPrivateRevenuePence: grossTotal,
    privateSplitPercent: d.privateSplitPercent,
    privateEarningsPence,
    consultationExclusionsPence: 0,
    labDeductionPence,
    superannuationPence: d.superannuationPence,
    therapyDeductionPence: therapyDeduction,
    financeFeesDeductionPence: financeFeesDeduction,
    manualAdjustmentsPence: d.manualAdjustmentsPence,
  });
}

export function goldenMonthPeriodTotalsPence(dentists = GOLDEN_MONTH_DENTISTS): {
  byDentist: Record<string, number>;
  total: number;
} {
  const byDentist: Record<string, number> = {};
  let total = 0;
  for (const d of dentists) {
    const pay = computeGoldenDentistFinalPayPence(d);
    byDentist[d.id] = pay;
    total += pay;
  }
  return { byDentist, total };
}
