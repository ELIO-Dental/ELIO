import { describe, expect, it } from "vitest";
import { resolveLineItemIdByIndex, totalsFromLines } from "./private-patient-line-utils";

describe("private patient lines (Y2.1b)", () => {
  it("resolves legacy patient_index to sorted line id", () => {
    const lines = [
      { id: "c", invoiceDate: "2026-05-10", createdAt: new Date("2026-05-01") },
      { id: "a", invoiceDate: "2026-05-01", createdAt: new Date("2026-05-01") },
      { id: "b", invoiceDate: "2026-05-05", createdAt: new Date("2026-05-01") },
    ];
    expect(resolveLineItemIdByIndex(lines, 0)).toBe("a");
    expect(resolveLineItemIdByIndex(lines, 2)).toBe("c");
    expect(resolveLineItemIdByIndex(lines, 9)).toBeNull();
  });

  it("totals gross private from paid amounts and finance fees", () => {
    expect(
      totalsFromLines([
        { amountPaidPence: 50000, isFinance: false, financeFeePence: null },
        { amountPaidPence: 30000, isFinance: true, financeFeePence: 1500 },
      ])
    ).toEqual({ grossPrivateRevenuePence: 80000, financeFeesPence: 1500 });
  });
});
