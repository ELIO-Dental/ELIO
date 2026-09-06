import { describe, expect, it } from "vitest";
import { attributeEmptyInvoicePractitioner } from "./dentally-fetch-empty-items";

describe("attributeEmptyInvoicePractitioner (Step 11 audit)", () => {
  const therapists = new Set(["288298"]);
  const dentists = new Map([
    ["100", "dentist-a"],
    ["288298", "dentist-therapist-misseed"], // mis-seeded therapist as dentist
  ]);

  it("skips therapist even when mapped as a dentist (empty-items fallback bug)", () => {
    const r = attributeEmptyInvoicePractitioner({
      practitionerId: "288298",
      therapistIds: therapists,
      dentistIdByPractitioner: dentists,
    });
    expect(r).toEqual({ action: "skip", reason: "THERAPIST_LINE" });
  });

  it("attributes mapped associate", () => {
    const r = attributeEmptyInvoicePractitioner({
      practitionerId: "100",
      therapistIds: therapists,
      dentistIdByPractitioner: dentists,
    });
    expect(r).toEqual({ action: "attribute", dentistId: "dentist-a", practitionerId: "100" });
  });

  it("marks unmapped for ops review (Step 12)", () => {
    const r = attributeEmptyInvoicePractitioner({
      practitionerId: "999001",
      therapistIds: therapists,
      dentistIdByPractitioner: dentists,
    });
    expect(r).toEqual({ action: "unmapped", practitionerId: "999001" });
  });

  it("skips non-clinician", () => {
    const r = attributeEmptyInvoicePractitioner({
      practitionerId: "50",
      therapistIds: therapists,
      dentistIdByPractitioner: dentists,
      isNonClinician: true,
    });
    expect(r).toEqual({ action: "skip", reason: "NON_CLINICIAN" });
  });
});
