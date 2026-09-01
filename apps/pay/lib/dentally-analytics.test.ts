import { describe, expect, it } from "vitest";
import { calculateDentistAnalytics } from "./dentally-analytics";

describe("dentally analytics (Y2.4)", () => {
  it("ranks top patients and treatments by hourly rate", () => {
    const analytics = calculateDentistAnalytics(
      [
        { name: "Alice", amount: 300, durationMins: 60, treatment: "Crown", hourlyRate: 300 },
        { name: "Bob", amount: 200, durationMins: 60, treatment: "Filling", hourlyRate: 200 },
        { name: "Cara", amount: 400, durationMins: 40, treatment: "Crown", hourlyRate: 600 },
      ],
      50
    );

    expect(analytics.topPatientsByHourlyRate[0]?.name).toBe("Cara");
    expect(analytics.topTreatmentsByHourlyRate[0]?.treatment).toBe("crown");
    expect(analytics.netPerHour).toBeGreaterThan(0);
    expect(analytics.utilizationPercent).toBeGreaterThan(0);
  });
});
