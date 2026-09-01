import { describe, expect, it } from "vitest";
import { normalizeInvoice, normalizePatient, normalizePayment, normalizeAccount, normalizeTreatmentsFromInvoice } from "./normalize";

describe("normalizePatient", () => {
  it("maps real-shaped Dentally patient fields", () => {
    const result = normalizePatient({
      id: 12766,
      first_name: "Mark",
      last_name: "Power",
      date_of_birth: "1979-12-23",
      email_address: null,
      mobile_phone: "+447951408659",
      home_phone: "+447538075746",
    });
    expect(result).toEqual({
      dentallyId: "12766",
      firstName: "Mark",
      lastName: "Power",
      dateOfBirth: new Date("1979-12-23"),
      email: null,
      phone: "+447951408659",
    });
  });
});

describe("normalizeInvoice / normalizeTreatmentsFromInvoice", () => {
  it("converts a string amount to pence", () => {
    const invoice = { id: 63983150, patient_id: 9939, amount: "27.9", dated_on: "2026-08-17" };
    expect(normalizeInvoice(invoice).totalPence).toBe(2790);
  });

  it("derives one treatment row per priced invoice item", () => {
    const invoice = {
      id: 1,
      patient_id: 9,
      dated_on: "2026-01-01",
      invoice_items: [
        { id: "a", amount: "10.00" },
        { id: "b", amount: "5.50" },
      ],
    };
    const treatments = normalizeTreatmentsFromInvoice(invoice);
    expect(treatments).toHaveLength(2);
    expect(treatments[0]).toMatchObject({ dentallyId: "1:a", amountPence: 1000 });
    expect(treatments[1]).toMatchObject({ dentallyId: "1:b", amountPence: 550 });
  });

  it("falls back to a single treatment row keyed on the invoice id when there are no line items", () => {
    const invoice = { id: 2, patient_id: 9, dated_on: "2026-01-01", amount: "40" };
    const treatments = normalizeTreatmentsFromInvoice(invoice);
    expect(treatments).toEqual([
      {
        dentallyId: "2",
        dentallyPatientId: "9",
        completedAt: new Date("2026-01-01"),
        amountPence: 4000,
        dentallyPractitionerId: null,
        dentallyTreatmentCategory: null,
      },
    ]);
  });
});

describe("normalizePayment", () => {
  it("prefers total over amount and maps dated_on to paidAt", () => {
    const result = normalizePayment({
      id: 99,
      patient_id: 42,
      amount: "10.00",
      total: "50.00",
      dated_on: "2026-03-15",
    });
    expect(result).toEqual({
      dentallyId: "99",
      dentallyPatientId: "42",
      amountPence: 5000,
      paidAt: new Date("2026-03-15"),
    });
  });

  it("falls back to created_at when dated_on is missing", () => {
    const result = normalizePayment({
      id: 1,
      patient_id: 2,
      amount: "75.50",
      created_at: "2026-01-10T12:00:00Z",
    });
    expect(result.amountPence).toBe(7550);
    expect(result.paidAt).toEqual(new Date("2026-01-10T12:00:00Z"));
  });
});

describe("normalizeAccount", () => {
  it("maps planned_private_treatment_value to pence", () => {
    const result = normalizeAccount({
      id: 10,
      patient_id: 16,
      current_balance: "200.0",
      planned_private_treatment_value: "1250.50",
      planned_nhs_treatment_value: "50.0",
    });
    expect(result).toEqual({
      dentallyId: "10",
      dentallyPatientId: "16",
      currentBalancePence: 20000,
      plannedPrivateTreatmentValuePence: 125050,
      plannedNhsTreatmentValuePence: 5000,
    });
  });
});
