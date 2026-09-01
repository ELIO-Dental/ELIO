import { describe, expect, it } from "vitest";
import {
  applyPrivatePatientLineUpdates,
  legacyTotalsFromPence,
  patientIndexForLineId,
  resolveLineItemIdByIndex,
  totalsFromLines,
  type PrivatePatientLineDraft,
} from "./private-patient-line-utils";

const baseLine = (): PrivatePatientLineDraft => ({
  amountPence: 10000,
  amountPaidPence: 5000,
  amountOutstandingPence: 5000,
  paymentStatus: "partial",
  isFinance: false,
  financeFeePence: null,
  flagged: false,
  flagReason: null,
});

describe("private patient line utils (Y2.1b)", () => {
  it("resolves legacy patient_index to sorted line id", () => {
    const lines = [
      { id: "c", invoiceDate: "2026-05-10", createdAt: new Date("2026-05-01") },
      { id: "a", invoiceDate: "2026-05-01", createdAt: new Date("2026-05-01") },
      { id: "b", invoiceDate: "2026-05-05", createdAt: new Date("2026-05-01") },
    ];
    expect(resolveLineItemIdByIndex(lines, 0)).toBe("a");
    expect(resolveLineItemIdByIndex(lines, 2)).toBe("c");
    expect(resolveLineItemIdByIndex(lines, 9)).toBeNull();
    expect(patientIndexForLineId(lines, "b")).toBe(1);
  });

  it("totals gross private from paid amounts and finance fees", () => {
    expect(
      totalsFromLines([
        { amountPaidPence: 50000, isFinance: false, financeFeePence: null },
        { amountPaidPence: 30000, isFinance: true, financeFeePence: 1500 },
      ])
    ).toEqual({ grossPrivateRevenuePence: 80000, financeFeesPence: 1500 });
  });

  it("maps pence totals to legacy pounds", () => {
    expect(legacyTotalsFromPence({ grossPrivateRevenuePence: 150050, financeFeesPence: 4012 })).toEqual({
      grossPrivate: 1500.5,
      financeFees: 40.12,
      grossPrivateRevenuePence: 150050,
      financeFeesPence: 4012,
    });
  });

  it("adjusts partial amounts proportionally when amount changes", () => {
    const line = baseLine();
    applyPrivatePatientLineUpdates(line, { amountPence: 20000 });
    expect(line.amountPaidPence).toBe(10000);
    expect(line.amountOutstandingPence).toBe(10000);
  });

  it("marks unpaid rows flagged with reason", () => {
    const line = baseLine();
    applyPrivatePatientLineUpdates(line, { paymentStatus: "unpaid" });
    expect(line.flagged).toBe(true);
    expect(line.flagReason).toBe("Invoice not paid");
    expect(line.amountPaidPence).toBe(0);
    expect(line.amountOutstandingPence).toBe(10000);
  });

  it("clears flag when resolved", () => {
    const line = { ...baseLine(), flagged: true, flagReason: "check" };
    applyPrivatePatientLineUpdates(line, { flagged: false });
    expect(line.flagged).toBe(false);
    expect(line.flagReason).toBeNull();
  });
});
