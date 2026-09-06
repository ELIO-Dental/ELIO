import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINANCE_TERM_MONTHS,
  lineNeedsFinanceTermOrFee,
  payslipIsProvisional,
  resolveFinanceFeeForLine,
  resolveFinanceRateForTerm,
  suggestFinanceFeePence,
} from "./finance-fee";

const rates = {
  finance_rate_3m: "0.045",
  finance_rate_12m: "0.08",
  finance_rate_36m: "0.034",
  finance_rate_60m: "0.037",
};

describe("finance-fee (Step 16)", () => {
  it("resolves rates from settings by term", () => {
    expect(resolveFinanceRateForTerm(rates, 12)).toBe(0.08);
    expect(resolveFinanceRateForTerm(rates, 3)).toBe(0.045);
    expect(suggestFinanceFeePence(100000, 0.08)).toBe(8000);
    expect(suggestFinanceFeePence(100000, 800)).toBe(8000); // basis points
  });

  it("suggests fee from term when fee blank", () => {
    const r = resolveFinanceFeeForLine(
      { isFinance: true, amountPence: 200000, financeTermMonths: 12 },
      rates
    );
    expect(r.feePence).toBe(16000);
    expect(r.termMonths).toBe(12);
    expect(r.usedDefault).toBe(false);
  });

  it("keeps manual fee", () => {
    const r = resolveFinanceFeeForLine(
      {
        isFinance: true,
        amountPence: 200000,
        financeTermMonths: 12,
        financeFeePence: 5000,
        financeFeeManual: true,
      },
      rates
    );
    expect(r.feePence).toBe(5000);
  });

  it("defaults to 12m @ 8% when neither set", () => {
    const r = resolveFinanceFeeForLine({ isFinance: true, amountPence: 100000 }, rates);
    expect(r.termMonths).toBe(DEFAULT_FINANCE_TERM_MONTHS);
    expect(r.feePence).toBe(8000);
    expect(r.usedDefault).toBe(true);
  });

  it("flags needs term/fee and provisional (term and/or fee clears)", () => {
    expect(
      lineNeedsFinanceTermOrFee({ isFinance: true, amountPence: 100, financeFeePence: null })
    ).toBe(true);
    expect(
      lineNeedsFinanceTermOrFee({
        isFinance: true,
        amountPence: 100,
        financeTermMonths: 12,
      })
    ).toBe(false);
    expect(
      lineNeedsFinanceTermOrFee({
        isFinance: true,
        amountPence: 100,
        financeFeePence: 800,
      })
    ).toBe(false);
    // Step 29 — fee=0 alone does not clear provisional
    expect(
      lineNeedsFinanceTermOrFee({
        isFinance: true,
        amountPence: 100,
        financeFeePence: 0,
      })
    ).toBe(true);
    expect(
      payslipIsProvisional([
        { isFinance: true, amountPence: 100 },
        { isFinance: false, amountPence: 50 },
      ])
    ).toBe(true);
    expect(
      payslipIsProvisional([
        { isFinance: true, amountPence: 100, financeTermMonths: 12 },
      ])
    ).toBe(false);
  });
});
