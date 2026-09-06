import { describe, expect, it } from "vitest";
import {
  classifyPrivateLine,
  defaultClassifyContext,
  type ClassifyPrivateLineContext,
} from "./dentally-line-filters";

function ctx(over: Partial<ClassifyPrivateLineContext> = {}): ClassifyPrivateLineContext {
  const dentistIdByUserId = over.dentistIdByUserId ?? new Map([["111", "dentist-a"]]);
  return defaultClassifyContext({
    dentistIdByUserId,
    nhsBandAmountsGbp: over.nhsBandAmountsGbp ?? [27.4],
    therapistIds: over.therapistIds ?? new Set(["999"]),
    excludedTreatments: over.excludedTreatments,
    nhsKeywords: over.nhsKeywords,
  });
}

const paidInvoice = { paid: true, balance: 0 };
const unpaidInvoice = { paid: false, balance: 50 };

describe("classifyPrivateLine ordered pipeline (Step 7)", () => {
  it("excludes EXCLUDED_TREATMENT before other rules", () => {
    const r = classifyPrivateLine(
      { name: "CBCT Mandible", amount: 120, practitioner_id: 111 },
      unpaidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "EXCLUDED_TREATMENT" });
  });

  it("excludes NHS_CHARGE", () => {
    const r = classifyPrivateLine(
      { name: "Exam", amount: 50, practitioner_id: 111, nhs_charge: true },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "NHS_CHARGE" });
  });

  it("excludes NHS_KEYWORD", () => {
    const r = classifyPrivateLine(
      { name: "Band 2 course", amount: 75, practitioner_id: 111 },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "NHS_KEYWORD" });
  });

  it("excludes NHS_BAND_PRICE within 1p", () => {
    const r = classifyPrivateLine(
      { name: "Private sounding", amount: 27.4, practitioner_id: 111 },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "NHS_BAND_PRICE" });
  });

  it("excludes ZERO_PRICE", () => {
    const r = classifyPrivateLine(
      { name: "Adjustment", amount: 0, practitioner_id: 111 },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "ZERO_PRICE" });
  });

  it("flags NOT_FULLY_PAID (not gross) when invoice unpaid", () => {
    const r = classifyPrivateLine(
      { name: "Crown", amount: 400, practitioner_id: 111 },
      unpaidInvoice,
      ctx()
    );
    expect(r.action).toBe("flag");
    if (r.action === "flag") {
      expect(r.reason).toBe("NOT_FULLY_PAID");
      expect(r.amountPence).toBe(40000);
    }
  });

  it("excludes THERAPIST_LINE", () => {
    const r = classifyPrivateLine(
      { name: "Hygiene", amount: 60, practitioner_id: 999 },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "THERAPIST_LINE" });
  });

  it("excludes seeded Taryn Dawson id 288298 from associate gross", () => {
    const r = classifyPrivateLine(
      { name: "Aligner fitting", amount: 90, practitioner_id: 288298 },
      paidInvoice,
      defaultClassifyContext({
        dentistIdByUserId: new Map([
          ["111", "dentist-a"],
          ["288298", "should-not-matter"],
        ]),
        therapistIds: new Set(["288298"]),
        nhsBandAmountsGbp: [],
      })
    );
    expect(r).toEqual({ action: "exclude", reason: "THERAPIST_LINE" });
  });

  it("excludes NHS_PLAN when payment_type/plan contains nhs", () => {
    const r = classifyPrivateLine(
      {
        name: "Whitening tray",
        amount: 250,
        practitioner_id: 111,
        payment_type: "NHS plan",
      },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "NHS_PLAN" });
  });

  it("excludes NHS_PLAN from invoice-level payment_plan when item fields empty", () => {
    const r = classifyPrivateLine(
      { name: "Private filling", amount: 120, practitioner_id: 111 },
      { ...paidInvoice, payment_plan_name: "NHS Capitation" },
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "NHS_PLAN" });
  });

  it("keeps private whitening on non-NHS payment (not patient-level NHS gate)", () => {
    const r = classifyPrivateLine(
      { name: "Whitening", amount: 350, practitioner_id: 111 },
      paidInvoice,
      ctx({ nhsBandAmountsGbp: [27.4, 75.3] })
    );
    expect(r).toEqual({
      action: "keep",
      practitionerUserId: "111",
      amountPence: 35000,
      name: "Whitening",
    });
  });

  it("excludes UNMAPPED_PRACTITIONER", () => {
    const r = classifyPrivateLine(
      { name: "Crown", amount: 200, practitioner_id: 777 },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({ action: "exclude", reason: "UNMAPPED_PRACTITIONER" });
  });

  it("keeps private survivor for gross", () => {
    const r = classifyPrivateLine(
      { name: "Composite", amount: 180, practitioner_id: 111 },
      paidInvoice,
      ctx()
    );
    expect(r).toEqual({
      action: "keep",
      practitionerUserId: "111",
      amountPence: 18000,
      name: "Composite",
    });
  });
});
