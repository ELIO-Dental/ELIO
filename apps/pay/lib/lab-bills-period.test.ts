import { describe, expect, it } from "vitest";
import {
  labBillAmountsPenceFromPayslipJson,
  labBillEntriesToPayslipJson,
  labShareDeductionPence,
} from "./lab-bills-period";

describe("labBillAmountsPenceFromPayslipJson", () => {
  it("returns null for missing", () => {
    expect(labBillAmountsPenceFromPayslipJson(null)).toBeNull();
    expect(labBillAmountsPenceFromPayslipJson(undefined)).toBeNull();
  });

  it("converts pounds to pence", () => {
    expect(labBillAmountsPenceFromPayslipJson([{ amount: 200 }])).toEqual([20000]);
  });

  it("returns empty array for empty list", () => {
    expect(labBillAmountsPenceFromPayslipJson([])).toEqual([]);
  });
});

describe("lab bills Step 15", () => {
  it("maps LabBillEntry rows to payslip JSON with links", () => {
    const rows = labBillEntriesToPayslipJson([
      {
        labName: "Acme",
        amountPence: 20000,
        fileUrl: "https://files.example/a.pdf",
      },
      { labName: "Beta", amountPence: 10000, fileUrl: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      lab_name: "Acme",
      amount: 200,
      description: undefined,
      file_url: "https://files.example/a.pdf",
    });
    expect(rows[1]?.file_url).toBeUndefined();
  });

  it("applies share once on total", () => {
    expect(labShareDeductionPence([20000, 10000], 0.5)).toBe(15000);
  });
});
