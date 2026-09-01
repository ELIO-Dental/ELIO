import { describe, expect, it } from "vitest";
import {
  activeMemberEnrolmentWhere,
  newSignupsPatientWhere,
  startOfCurrentMonth,
} from "./dashboard-stats-formulas";

describe("dashboard stats formulas (P5.2 legacy parity)", () => {
  it("active members require ACTIVE enrolment, patient, and mandate", () => {
    expect(activeMemberEnrolmentWhere("practice-1")).toEqual({
      practiceId: "practice-1",
      status: "ACTIVE",
      planPatient: {
        practiceId: "practice-1",
        status: "ACTIVE",
        mandates: { some: { status: "ACTIVE" } },
      },
    });
  });

  it("new signups use mandate-linked-this-month or free-plan proxy", () => {
    const start = new Date(2026, 8, 1);
    expect(newSignupsPatientWhere("practice-1", start)).toEqual({
      practiceId: "practice-1",
      status: "ACTIVE",
      OR: [
        { mandates: { some: { status: "ACTIVE", createdAt: { gte: start } } } },
        { planModel: { monthlyPricePence: 0 }, createdAt: { gte: start } },
      ],
    });
  });

  it("startOfCurrentMonth returns first day of month", () => {
    expect(startOfCurrentMonth(new Date(2026, 8, 15, 12, 0, 0))).toEqual(new Date(2026, 8, 1));
  });
});
