import { describe, it, expect } from "vitest";
import { getPayPeriodBoundaries } from "./period";
import {
  calculatePrivateEarnings,
  calculateFinalPay,
  calculateLabDeduction,
  calculateNhsEarnings,
  GROSS_PRIVATE_THERAPIST_PENCE,
  resolveGrossTotalPence,
  type TreatmentRecord,
} from "./pay-calc";

describe("calculatePrivateEarnings — §6.3, £50 cosmetic consultation exclusion", () => {
  const { startDate, endDate } = getPayPeriodBoundaries(6, 2026); // June 2026

  it("excludes a £50 cosmetic consultation entirely from gross and from private earnings", () => {
    const treatments: TreatmentRecord[] = [
      {
        id: "t-consult",
        dentistId: "dentist-1",
        completedAt: "2026-06-10",
        amountPence: 5000, // £50
        isCosmeticConsultation: true,
      },
      {
        id: "t-crown",
        dentistId: "dentist-1",
        completedAt: "2026-06-12",
        amountPence: 80000, // £800 crown, non-exempt
        isCosmeticConsultation: false,
      },
    ];

    const result = calculatePrivateEarnings("dentist-1", treatments, startDate, endDate, 50);

    // Proof: gross revenue is ONLY the £800 crown — the £50 consult never enters it.
    expect(result.grossPrivateRevenuePence).toBe(80000);
    expect(result.consultationExclusionsPence).toBe(5000);
    // 50% split of £800 = £400, NOT 50% of £850.
    expect(result.privateEarningsPence).toBe(40000);

    const consultLine = result.lineItems.find((l) => l.treatmentId === "t-consult");
    expect(consultLine?.excludedAsConsultation).toBe(true);
  });

  it("ignores another dentist's treatment", () => {
    const treatments: TreatmentRecord[] = [
      { id: "t1", dentistId: "dentist-OTHER", completedAt: "2026-06-10", amountPence: 100000, isCosmeticConsultation: false },
    ];
    const result = calculatePrivateEarnings("dentist-1", treatments, startDate, endDate, 50);
    expect(result.grossPrivateRevenuePence).toBe(0);
  });

  it("ignores treatment outside the exact period", () => {
    const treatments: TreatmentRecord[] = [
      { id: "t1", dentistId: "dentist-1", completedAt: "2026-07-01", amountPence: 100000, isCosmeticConsultation: false }, // next month, excluded by half-open interval
      { id: "t2", dentistId: "dentist-1", completedAt: "2026-05-31", amountPence: 100000, isCosmeticConsultation: false }, // previous month
    ];
    const result = calculatePrivateEarnings("dentist-1", treatments, startDate, endDate, 50);
    expect(result.grossPrivateRevenuePence).toBe(0);
  });

  it("ignores non-completed (planned/future) treatment", () => {
    const treatments: TreatmentRecord[] = [
      { id: "t1", dentistId: "dentist-1", completedAt: null, amountPence: 100000, isCosmeticConsultation: false },
    ];
    const result = calculatePrivateEarnings("dentist-1", treatments, startDate, endDate, 50);
    expect(result.grossPrivateRevenuePence).toBe(0);
  });

  // Legacy AuraPay clamped an out-of-range split % (e.g. a typo'd 150) to [0, 100] and
  // warned rather than using it as-is — a prior version of this function had dropped
  // that clamp entirely, so a bad dentist-record value would silently produce a wrong
  // split instead of being capped.
  it("clamps a split % above 100 and reports a warning", () => {
    const treatments: TreatmentRecord[] = [
      { id: "t1", dentistId: "dentist-1", completedAt: "2026-06-10", amountPence: 100000, isCosmeticConsultation: false },
    ];
    const result = calculatePrivateEarnings("dentist-1", treatments, startDate, endDate, 150);
    expect(result.privateEarningsPence).toBe(100000); // 100% of £1000, not 150%
    expect(result.splitPercentWarning).toMatch(/150/);
    expect(result.splitPercentWarning).toMatch(/clamped to 100/);
  });

  it("clamps a negative split % to 0 and reports a warning", () => {
    const treatments: TreatmentRecord[] = [
      { id: "t1", dentistId: "dentist-1", completedAt: "2026-06-10", amountPence: 100000, isCosmeticConsultation: false },
    ];
    const result = calculatePrivateEarnings("dentist-1", treatments, startDate, endDate, -10);
    expect(result.privateEarningsPence).toBe(0);
    expect(result.splitPercentWarning).toMatch(/clamped to 0/);
  });

  it("reports no warning for a valid split % (backward compatible)", () => {
    const treatments: TreatmentRecord[] = [
      { id: "t1", dentistId: "dentist-1", completedAt: "2026-06-10", amountPence: 100000, isCosmeticConsultation: false },
    ];
    const result = calculatePrivateEarnings("dentist-1", treatments, startDate, endDate, 50);
    expect(result.splitPercentWarning).toBeUndefined();
  });
});

describe("calculateFinalPay — §6.5 final formula", () => {
  it("PERCENTAGE_SPLIT: NHS + private − 50% lab − superannuation ± adjustments", () => {
    const final = calculateFinalPay({
      payType: "PERCENTAGE_SPLIT",
      udas: 232.4,
      udaRatePence: 1550, // £15.50/UDA
      grossPrivateRevenuePence: 80000,
      privateSplitPercent: 50,
      privateEarningsPence: 40000,
      consultationExclusionsPence: 5000,
      labDeductionPence: 10000,
      superannuationPence: 59335, // £593.35
      manualAdjustmentsPence: 0,
    });
    // NHS = round(232.4 * 1550) = 360220
    const expected = 360220 + 40000 - 10000 - 59335;
    expect(final).toBe(expected);
  });

  it("HOURLY: hours × rate ± adjustments, no NHS/private/lab/superannuation legs", () => {
    const final = calculateFinalPay({
      payType: "HOURLY",
      hoursWorked: 20,
      hourlyRatePence: 3000,
      manualAdjustmentsPence: -500,
    });
    expect(final).toBe(20 * 3000 - 500);
  });

  it("is deterministic — same input always reproduces the identical figure (BUG-2-style guarantee for locked payslips)", () => {
    const input = {
      payType: "PERCENTAGE_SPLIT" as const,
      udas: 100,
      udaRatePence: 1500,
      grossPrivateRevenuePence: 50000,
      privateSplitPercent: 45,
      privateEarningsPence: 22500,
      consultationExclusionsPence: 0,
      labDeductionPence: 5000,
      superannuationPence: 10000,
    };
    expect(calculateFinalPay(input)).toBe(calculateFinalPay(input));
  });

  it("PERCENTAGE_SPLIT: also deducts therapy and finance fees (AuraPay Y1.5)", () => {
    const final = calculateFinalPay({
      payType: "PERCENTAGE_SPLIT",
      udas: 100,
      udaRatePence: 1500,
      grossPrivateRevenuePence: 50000,
      privateSplitPercent: 50,
      privateEarningsPence: 25000,
      consultationExclusionsPence: 0,
      labDeductionPence: 0,
      superannuationPence: 0,
      therapyDeductionPence: 3500,
      financeFeesDeductionPence: 1000,
    });
    // NHS 150000 + private 25000 - therapy 3500 - finance 1000
    expect(final).toBe(150000 + 25000 - 3500 - 1000);
  });
});

describe("calculateLabDeduction — §6.4, dentist share of attributable lab bills", () => {
  it("defaults to 50% (5000 bp)", () => {
    expect(calculateLabDeduction([10000, 5000, 999])).toBe(Math.round((15999 * 5000) / 10000));
  });
  it("accepts custom split as basis points", () => {
    expect(calculateLabDeduction([10000], 6000)).toBe(6000);
  });
  it("accepts legacy float fraction for compatibility", () => {
    expect(calculateLabDeduction([10000], 0.6)).toBe(6000);
  });
  it("zero bills = zero deduction", () => {
    expect(calculateLabDeduction([])).toBe(0);
  });
});

describe("Step 20 golden example — integer pence invariant", () => {
  it("50% split, default shares → total_payment 32500p", () => {
    const gross = 100_000;
    const netPrivate = Math.round((gross * 50) / 100); // 50000
    const labShare = calculateLabDeduction([20_000], 5000); // 10000
    const financeShare = Math.round((8000 * 5000) / 10000); // 4000
    const therapy = Math.round((60 * 3500) / 60); // 3500
    const totalDeductions = labShare + financeShare + therapy; // 17500
    const totalPayment = netPrivate - totalDeductions; // 32500
    expect(netPrivate).toBe(50_000);
    expect(labShare).toBe(10_000);
    expect(financeShare).toBe(4_000);
    expect(therapy).toBe(3_500);
    expect(totalDeductions).toBe(17_500);
    expect(totalPayment).toBe(32_500);
    expect(
      calculateFinalPay({
        payType: "PERCENTAGE_SPLIT",
        udas: 0,
        udaRatePence: 0,
        grossPrivateRevenuePence: gross,
        privateSplitPercent: 50,
        privateEarningsPence: netPrivate,
        consultationExclusionsPence: 0,
        labDeductionPence: labShare,
        superannuationPence: 0,
        therapyDeductionPence: therapy,
        financeFeesDeductionPence: financeShare,
      })
    ).toBe(32_500);
  });
});

describe("Step 23 — LAB_AFTER_SPLIT only", () => {
  it("gross 100000p × 50% → net 50000 → after lab 10000p → 40000 (before other deductions)", () => {
    const gross = 100_000;
    const netPrivate = Math.round((gross * 50) / 100);
    const labShare = calculateLabDeduction([20_000], 5000);
    expect(netPrivate).toBe(50_000);
    expect(labShare).toBe(10_000);
    expect(netPrivate - labShare).toBe(40_000);
    expect(
      calculateFinalPay({
        payType: "PERCENTAGE_SPLIT",
        udas: 0,
        udaRatePence: 0,
        grossPrivateRevenuePence: gross,
        privateSplitPercent: 50,
        privateEarningsPence: netPrivate,
        consultationExclusionsPence: 0,
        labDeductionPence: labShare,
        superannuationPence: 0,
        therapyDeductionPence: 0,
        financeFeesDeductionPence: 0,
      })
    ).toBe(40_000);
  });
});

describe("calculateNhsEarnings — §6.2, UDAs × ELIO-configured rate (never the statement's own rate)", () => {
  it("multiplies UDAs by the configured pence rate", () => {
    expect(calculateNhsEarnings(232.4, 1550)).toBe(Math.round(232.4 * 1550));
  });
});

describe("Step 33 — gross_private_therapist locked at 0", () => {
  it("exports zero therapist gross constant", () => {
    expect(GROSS_PRIVATE_THERAPIST_PENCE).toBe(0);
  });

  it("gross_total equals dentist gross only (therapist term is zero)", () => {
    expect(resolveGrossTotalPence(80_000)).toBe(80_000);
    expect(resolveGrossTotalPence(0)).toBe(0);
  });

  it("final pay uses therapyDeductionPence from minutes, not therapist gross", () => {
    const withoutTherapy = calculateFinalPay({
      payType: "PERCENTAGE_SPLIT",
      udas: 0,
      udaRatePence: 0,
      grossPrivateRevenuePence: 50_000,
      privateSplitPercent: 50,
      privateEarningsPence: 25_000,
      consultationExclusionsPence: 0,
      labDeductionPence: 0,
      superannuationPence: 0,
      therapyDeductionPence: 0,
    });
    const withMinutesDeduction = calculateFinalPay({
      payType: "PERCENTAGE_SPLIT",
      udas: 0,
      udaRatePence: 0,
      grossPrivateRevenuePence: 50_000,
      privateSplitPercent: 50,
      privateEarningsPence: 25_000,
      consultationExclusionsPence: 0,
      labDeductionPence: 0,
      superannuationPence: 0,
      therapyDeductionPence: 3500, // 60 mins × £35/hr
    });
    expect(withoutTherapy).toBe(25_000);
    expect(withMinutesDeduction).toBe(25_000 - 3500);
    // Therapist gross never inflates private earnings base
    expect(resolveGrossTotalPence(50_000)).toBe(50_000);
  });
});
