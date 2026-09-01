import { describe, expect, it } from "vitest";
import { mapDentallySearchPatient } from "./plans-patient-search-map";

describe("mapDentallySearchPatient", () => {
  it("maps snake_case Dentally fields to search shape", () => {
    const mapped = mapDentallySearchPatient({
      id: 42,
      first_name: "Jane",
      last_name: "Doe",
      email_address: "jane@example.com",
      mobile_phone: "07700900123",
      payment_plan_id: 7,
      active: true,
    });
    expect(mapped).toEqual({
      id: "42",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      dateOfBirth: undefined,
      phone: undefined,
      mobile: "07700900123",
      paymentPlanId: 7,
      active: true,
    });
  });

  it("defaults active to true when omitted", () => {
    const mapped = mapDentallySearchPatient({ id: 1 });
    expect(mapped.active).toBe(true);
  });
});
