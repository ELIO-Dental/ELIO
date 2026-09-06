import { describe, expect, it } from "vitest";
import {
  parsePayslipAdjustments,
  parsePayslipLabBills,
  prepareAdjustmentsForSave,
  sumAdjustmentsToManualPence,
  validatePayslipAdjustments,
} from "./payslip-editable-fields";
import {
  normalizeSavePayslipEntryInput,
  PayslipAdjustmentValidationError,
} from "./save-payslip-entry";

describe("payslip editable fields (Step 27)", () => {
  it("parses adjustments with amountPence and legacy pounds", () => {
    const items = parsePayslipAdjustments([
      { description: "Bonus", amount: 50, type: "addition" },
      { description: "Correction", amountPence: 1000, type: "deduction" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.amountPence).toBe(5000);
    expect(items[1]?.amountPence).toBe(1000);
    expect(sumAdjustmentsToManualPence(items)).toBe(4000);
  });

  it("requires note and positive integer pence", () => {
    expect(
      validatePayslipAdjustments([{ description: "", amount: 10, amountPence: 1000, type: "addition" }])
    ).toMatch(/note/i);
    expect(
      validatePayslipAdjustments([
        { description: "Ok", amount: 10, amountPence: 1000, type: "addition" },
      ])
    ).toBeNull();
  });

  it("stamps who/when on save prepare", () => {
    const stamped = prepareAdjustmentsForSave(
      [{ description: "Bonus", amount: 50, amountPence: 5000, type: "addition" }],
      "user-1",
      new Date("2026-05-01T12:00:00.000Z")
    );
    expect(stamped[0]?.createdBy).toBe("user-1");
    expect(stamped[0]?.createdAt).toBe("2026-05-01T12:00:00.000Z");
  });

  it("parses lab bills JSON", () => {
    const items = parsePayslipLabBills([
      { lab_name: "Acme Lab", amount: 120.5, file_url: "https://example.com/bill.pdf" },
      { lab_name: "Other", amount: 10, link: "https://example.com/other.pdf" },
    ]);
    expect(items[0]?.lab_name).toBe("Acme Lab");
    expect(items[0]?.amount).toBe(120.5);
    expect(items[0]?.file_url).toBe("https://example.com/bill.pdf");
    expect(items[1]?.file_url).toBe("https://example.com/other.pdf");
  });
});

describe("normalizeSavePayslipEntryInput adjustments (Step 27)", () => {
  it("rejects missing notes", () => {
    expect(() =>
      normalizeSavePayslipEntryInput(
        {
          payslipEntryId: "ps-1",
          adjustments: [{ description: "", amount: 10, type: "addition" }],
        },
        { actorUserId: "u1" }
      )
    ).toThrow(PayslipAdjustmentValidationError);
  });

  it("sums + and − into manualAdjustmentsPence", () => {
    const input = normalizeSavePayslipEntryInput(
      {
        payslipEntryId: "ps-1",
        adjustments: [
          { description: "Bonus", amount: 50, type: "addition" },
          { description: "Correction", amount: 10, type: "deduction" },
        ],
      },
      { actorUserId: "u1" }
    );
    expect(input.manualAdjustmentsPence).toBe(4000);
    const rows = input.adjustmentsJson as Array<{ amountPence: number; createdBy: string }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.createdBy).toBe("u1");
  });
});
