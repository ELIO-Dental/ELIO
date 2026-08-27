import { describe, it, expect } from "vitest";
import { getPayPeriodBoundaries } from "./period";
import {
  calculatePrivateEarnings,
  calculateFinalPay,
  calculateLabDeduction,
  calculateNhsEarnings,
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
});

describe("calculateLabDeduction — §6.4, 50% of attributable lab bills", () => {
  it("deducts exactly half the total", () => {
    expect(calculateLabDeduction([10000, 5000, 999])).toBe(Math.round(15999 / 2));
  });
  it("zero bills = zero deduction", () => {
    expect(calculateLabDeduction([])).toBe(0);
  });
});

describe("calculateNhsEarnings — §6.2, UDAs × ELIO-configured rate (never the statement's own rate)", () => {
  it("multiplies UDAs by the configured pence rate", () => {
    expect(calculateNhsEarnings(232.4, 1550)).toBe(Math.round(232.4 * 1550));
  });
});
