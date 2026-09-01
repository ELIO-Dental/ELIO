import { describe, expect, it } from "vitest";
import { dedupePatientsByDentallyId, matchPaymentPlanIds } from "./plans-sync-helpers";

describe("matchPaymentPlanIds", () => {
  it("matches mapped plan names case-insensitively", () => {
    const ids = matchPaymentPlanIds(
      [{ dentallyPlanName: "AuraCare Gold", planModelId: "plan-1" }],
      [
        { id: 10, name: "AuraCare Gold" },
        { id: 20, name: "Other Plan" },
      ],
    );
    expect(ids).toEqual([10]);
  });

  it("returns empty when no names match", () => {
    const ids = matchPaymentPlanIds(
      [{ dentallyPlanName: "Missing", planModelId: "plan-1" }],
      [{ id: 10, name: "AuraCare Gold" }],
    );
    expect(ids).toEqual([]);
  });
});

describe("dedupePatientsByDentallyId", () => {
  it("keeps first occurrence per dentally id", () => {
    const deduped = dedupePatientsByDentallyId([
      { dentallyId: "1", firstName: "A" },
      { dentallyId: "1", firstName: "B" },
      { dentallyId: "2", firstName: "C" },
    ]);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.firstName).toBe("A");
  });
});
