import { describe, expect, it } from "vitest";
import {
  buildPriorFinanceOpsLookup,
  canRunPeriodCalculation,
  mergeFinanceOpsOntoFetchedLine,
  privateLineIdentityKey,
} from "./month-pipeline";

describe("month pipeline (Step 34)", () => {
  it("blocks calculate while Dentally fetch is RUNNING", () => {
    expect(canRunPeriodCalculation({ periodStatus: "DRAFT", dentallyFetchStatus: "RUNNING" })).toEqual({
      ok: false,
      status: 409,
      error: expect.stringMatching(/fetch is still running/i),
    });
  });

  it("blocks calculate when period is locked", () => {
    expect(canRunPeriodCalculation({ periodStatus: "LOCKED", dentallyFetchStatus: "SUCCESS" }).ok).toBe(
      false
    );
  });

  it("allows calculate when draft and fetch idle/success", () => {
    expect(canRunPeriodCalculation({ periodStatus: "DRAFT", dentallyFetchStatus: "SUCCESS" })).toEqual({
      ok: true,
    });
    expect(canRunPeriodCalculation({ periodStatus: "DRAFT" })).toEqual({ ok: true });
  });

  it("preserves finance term/fee across re-fetch by invoice identity", () => {
    const prior = buildPriorFinanceOpsLookup([
      {
        dentallyInvoiceId: "inv-1",
        dentallyLineKey: "amt:10000",
        amountPence: 10000,
        financeTermMonths: 12,
        financeFeePence: 450,
        financeFeeManual: true,
      },
    ]);
    const merged = mergeFinanceOpsOntoFetchedLine(
      {
        dentallyInvoiceId: "inv-1",
        dentallyLineKey: "amt:10000",
        amountPence: 10000,
        isFinance: true,
      },
      prior
    );
    expect(merged).toEqual({
      financeTermMonths: 12,
      financeFeePence: 450,
      financeFeeManual: true,
    });
    expect(privateLineIdentityKey({ dentallyInvoiceId: "inv-1", amountPence: 10000 })).toBe(
      "inv-1::amt:10000"
    );
  });

  it("does not invent finance ops for new invoice ids", () => {
    const prior = buildPriorFinanceOpsLookup([
      {
        dentallyInvoiceId: "inv-old",
        amountPence: 5000,
        financeTermMonths: 3,
        financeFeePence: 100,
        financeFeeManual: false,
      },
    ]);
    expect(
      mergeFinanceOpsOntoFetchedLine(
        { dentallyInvoiceId: "inv-new", amountPence: 5000, isFinance: true },
        prior
      )
    ).toEqual({ financeTermMonths: null, financeFeePence: null, financeFeeManual: false });
  });
});
