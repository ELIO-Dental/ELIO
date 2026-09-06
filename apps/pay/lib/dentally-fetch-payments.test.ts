import { describe, expect, it } from "vitest";
import type { DentallyPaymentRaw } from "@elio/dentally";
import {
  buildInvoicePaymentMethodMap,
  buildPatientFinanceSet,
  buildPaymentsListQueryParams,
  invoiceIsFinanceFromPayments,
  isFinancePaymentMethod,
  paymentWindowBounds,
} from "./dentally-fetch-payments";

describe("paymentWindowBounds (Step 5)", () => {
  it("is 180 days before start and 30 days after exclusive end", () => {
    expect(paymentWindowBounds("2026-06-01", "2026-07-01")).toEqual({
      datedAfter: "2025-12-03",
      datedBefore: "2026-07-31",
    });
  });
});

describe("buildPaymentsListQueryParams", () => {
  it("sets dated_after / dated_before + site_id", () => {
    expect(buildPaymentsListQueryParams("s1", "2025-12-03", "2026-07-31")).toEqual({
      site_id: "s1",
      dated_after: "2025-12-03",
      dated_before: "2026-07-31",
    });
  });
});

describe("finance method maps", () => {
  const payments: DentallyPaymentRaw[] = [
    {
      id: 1,
      method: "Card",
      patient_id: 10,
      explanations: [{ invoice_id: 100 }],
    },
    {
      id: 2,
      method: "Finance",
      patient_id: 10,
      explanations: [{ invoice_id: 100 }, { invoice_id: 101 }],
    },
    {
      id: 3,
      method: "Cash",
      patient_id: 11,
      explanations: [{ invoice_id: 101 }],
    },
    {
      id: 4,
      method: "Finance",
      patient_id: 12,
      explanations: [],
    },
  ];

  it("treats only exact Finance method as finance", () => {
    expect(isFinancePaymentMethod("Finance")).toBe(true);
    expect(isFinancePaymentMethod("finance")).toBe(true);
    expect(isFinancePaymentMethod("Tabeo")).toBe(false);
    expect(isFinancePaymentMethod("Card")).toBe(false);
  });

  it("any Finance wins on an invoice; Cash cannot overwrite", () => {
    const map = buildInvoicePaymentMethodMap(payments);
    expect(isFinancePaymentMethod(map.get("100"))).toBe(true);
    expect(isFinancePaymentMethod(map.get("101"))).toBe(true);
  });

  it("patient finance set covers Finance patients even without explanations", () => {
    const patients = buildPatientFinanceSet(payments);
    expect(patients.has("10")).toBe(true);
    expect(patients.has("12")).toBe(true);
    expect(patients.has("11")).toBe(false);
  });

  it("invoiceIsFinanceFromPayments uses map then patient backup", () => {
    const map = buildInvoicePaymentMethodMap(payments);
    const patients = buildPatientFinanceSet(payments);
    expect(invoiceIsFinanceFromPayments("100", "10", map, patients)).toBe(true);
    expect(invoiceIsFinanceFromPayments("999", "12", map, patients)).toBe(true);
    expect(invoiceIsFinanceFromPayments("999", "11", map, patients)).toBe(false);
  });

  it("known Card method is not overridden by patient Finance history", () => {
    const map = new Map([["200", "Card"]]);
    const patients = new Set(["10"]);
    expect(invoiceIsFinanceFromPayments("200", "10", map, patients)).toBe(false);
  });
});
