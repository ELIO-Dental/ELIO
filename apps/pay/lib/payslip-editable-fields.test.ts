import { describe, expect, it } from "vitest";
import { parsePayslipAdjustments, parsePayslipLabBills } from "./payslip-editable-fields";

describe("payslip editable fields (Y2.9)", () => {
  it("parses adjustments JSON", () => {
    const items = parsePayslipAdjustments([
      { description: "Bonus", amount: 50, type: "addition" },
      { description: "Correction", amount: 10, type: "deduction" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.type).toBe("addition");
  });

  it("parses lab bills JSON", () => {
    const items = parsePayslipLabBills([{ lab_name: "Acme Lab", amount: 120.5 }]);
    expect(items[0]?.lab_name).toBe("Acme Lab");
    expect(items[0]?.amount).toBe(120.5);
  });
});
