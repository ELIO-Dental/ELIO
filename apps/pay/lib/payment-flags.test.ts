import { describe, expect, it } from "vitest";
import {
  buildPaymentFlagsFromLines,
  lineCountsTowardGross,
  paymentFlagsToDiscrepancies,
} from "./payment-flags";

describe("lineCountsTowardGross (Step 10 / §4.3)", () => {
  it("includes only fully paid non-flagged lines", () => {
    expect(
      lineCountsTowardGross({ amountPence: 10000, paymentStatus: "paid", flagged: false })
    ).toBe(true);
  });

  it("excludes unpaid, partial, flagged, and outstanding", () => {
    expect(lineCountsTowardGross({ amountPence: 10000, paymentStatus: "unpaid" })).toBe(false);
    expect(lineCountsTowardGross({ amountPence: 10000, paymentStatus: "partial" })).toBe(false);
    expect(lineCountsTowardGross({ amountPence: 10000, paymentStatus: "paid", flagged: true })).toBe(
      false
    );
    expect(
      lineCountsTowardGross({
        amountPence: 10000,
        paymentStatus: "paid",
        amountOutstandingPence: 500,
      })
    ).toBe(false);
  });
});

describe("buildPaymentFlagsFromLines", () => {
  it("stores PDF-required fields for unpaid/partial", () => {
    const flags = buildPaymentFlagsFromLines([
      {
        patientName: "Jane Doe",
        amountPence: 20000,
        treatmentDescription: "Crown",
        invoiceDate: "2026-06-15",
        amountOutstandingPence: 20000,
        paymentStatus: "unpaid",
        flagged: true,
        dentallyInvoiceId: "inv-1",
      },
      {
        patientName: "Paid Patient",
        amountPence: 5000,
        paymentStatus: "paid",
        flagged: false,
        amountOutstandingPence: 0,
      },
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      patientName: "Jane Doe",
      amountPence: 20000,
      treatment: "Crown",
      invoiceDate: "2026-06-15",
      outstandingBalancePence: 20000,
    });
  });
});

describe("paymentFlagsToDiscrepancies", () => {
  it("maps flags into review list with treatment + outstanding in notes", () => {
    const d = paymentFlagsToDiscrepancies([
      {
        patientName: "A",
        amountPence: 10000,
        treatment: "Fill",
        invoiceDate: "2026-06-01",
        outstandingBalancePence: 4000,
        paymentStatus: "partial",
      },
    ]);
    expect(d[0]?.type).toBe("partial_payment");
    expect(d[0]?.notes).toContain("Fill");
    expect(d[0]?.notes).toContain("Outstanding");
    expect(d[0]?.outstandingBalance).toBe(40);
  });
});
