import { describe, expect, it } from "vitest";
import { normalizeBillPaidInput, parseLegacyPaidDate, parseLegacyPaidFlag } from "./bill-paid";

describe("bill paid helpers (Y3.1)", () => {
  it("marks unpaid when flag is false", () => {
    expect(normalizeBillPaidInput({ paid: false })).toEqual({ paid: false, paidAt: null });
  });

  it("marks paid with explicit date", () => {
    const result = normalizeBillPaidInput({ paid: true, paid_date: "2025-06-15" });
    expect(result.paid).toBe(true);
    expect(result.paidAt?.toISOString().slice(0, 10)).toBe("2025-06-15");
  });

  it("parses legacy integer paid flags", () => {
    expect(parseLegacyPaidFlag(1)).toBe(true);
    expect(parseLegacyPaidFlag(0)).toBe(false);
  });

  it("parses legacy paid_date strings", () => {
    const date = parseLegacyPaidDate("2025-01-20");
    expect(date?.toISOString().slice(0, 10)).toBe("2025-01-20");
  });
});
