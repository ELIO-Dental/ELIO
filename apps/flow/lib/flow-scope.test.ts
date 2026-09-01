import { describe, expect, it } from "vitest";
import {
  consultMatchesPractitionerScope,
  resolveEffectiveDentistFilter,
  type FlowPractitionerScope,
} from "./flow-scope-utils";

describe("consultMatchesPractitionerScope", () => {
  const ownOnly: FlowPractitionerScope = { viewAll: false, dentistId: "dentist-1" };

  it("allows all when viewAll", () => {
    expect(consultMatchesPractitionerScope({ practitionerDentistId: "other" }, { viewAll: true, dentistId: null })).toBe(
      true
    );
  });

  it("restricts to linked dentist", () => {
    expect(consultMatchesPractitionerScope({ practitionerDentistId: "dentist-1" }, ownOnly)).toBe(true);
    expect(consultMatchesPractitionerScope({ practitionerDentistId: "dentist-2" }, ownOnly)).toBe(false);
  });

  it("allows all for unlinked staff without view-all", () => {
    expect(consultMatchesPractitionerScope({ practitionerDentistId: "dentist-2" }, { viewAll: true, dentistId: null })).toBe(
      true
    );
  });
});

describe("resolveEffectiveDentistFilter", () => {
  it("forces linked dentist when scope is restricted", () => {
    expect(resolveEffectiveDentistFilter({ viewAll: false, dentistId: "dentist-1" }, "dentist-9")).toBe("dentist-1");
  });

  it("honours requested filter when viewAll", () => {
    expect(resolveEffectiveDentistFilter({ viewAll: true, dentistId: null }, "dentist-9")).toBe("dentist-9");
  });
});
