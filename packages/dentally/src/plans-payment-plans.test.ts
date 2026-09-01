import { describe, expect, it } from "vitest";
import { mapLiveDentallyPaymentPlan } from "./plans-payment-plans-map";

describe("mapLiveDentallyPaymentPlan", () => {
  it("maps Dentally payment plan fields", () => {
    expect(
      mapLiveDentallyPaymentPlan({
        id: 3,
        name: "AuraCare Gold",
        patient_friendly_name: "Gold Plan",
        active: true,
      }),
    ).toEqual({
      id: 3,
      name: "AuraCare Gold",
      patientFriendlyName: "Gold Plan",
      active: true,
    });
  });
});
