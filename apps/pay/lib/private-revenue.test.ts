import { describe, expect, it } from "vitest";
import { privateRevenueItemsToTreatments, therapyDeductionPence } from "./private-revenue";

describe("privateRevenueItemsToTreatments (Step 10)", () => {
  it("omits unpaid/partial/flagged from gross treatments", () => {
    const treatments = privateRevenueItemsToTreatments(
      "d1",
      [
        {
          id: "1",
          amountPence: 10000,
          excludedAsConsultation: false,
          paymentStatus: "paid",
          flagged: false,
          amountOutstandingPence: 0,
        },
        {
          id: "2",
          amountPence: 20000,
          excludedAsConsultation: false,
          paymentStatus: "unpaid",
          flagged: true,
          amountOutstandingPence: 20000,
        },
        {
          id: "3",
          amountPence: 5000,
          excludedAsConsultation: false,
          paymentStatus: "partial",
          flagged: true,
          amountOutstandingPence: 2000,
        },
      ],
      "2026-06-01T00:00:00.000Z"
    );
    expect(treatments).toHaveLength(1);
    expect(treatments[0]?.amountPence).toBe(10000);
  });
});

describe("therapyDeductionPence (Step 18)", () => {
  it("60 minutes at default £35/hr → £35.00", () => {
    expect(therapyDeductionPence(60, null)).toBe(3500);
    expect(therapyDeductionPence(60, 0)).toBe(3500);
  });

  it("30 minutes at default → £17.50", () => {
    expect(therapyDeductionPence(30, null)).toBe(1750);
  });

  it("0 minutes → 0", () => {
    expect(therapyDeductionPence(0, 0.5833)).toBe(0);
    expect(therapyDeductionPence(null, 0.5833)).toBe(0);
  });

  it("uses explicit £/min when set", () => {
    expect(therapyDeductionPence(60, 0.5833)).toBe(3500);
    expect(therapyDeductionPence(10, 1)).toBe(1000);
  });
});
