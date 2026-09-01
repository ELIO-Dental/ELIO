import { describe, expect, it } from "vitest";
import {
  resolveConsultBookedBy,
  shouldMarkPractitionerEdited,
  shouldUpdatePractitionerFromSync,
} from "./flow-consult-import";

describe("resolveConsultBookedBy", () => {
  it("trims and returns null for empty values", () => {
    expect(resolveConsultBookedBy("  Reception  ")).toBe("Reception");
    expect(resolveConsultBookedBy("")).toBeNull();
    expect(resolveConsultBookedBy(null)).toBeNull();
  });
});

describe("shouldUpdatePractitionerFromSync", () => {
  it("allows fill when practitioner not edited and empty", () => {
    expect(
      shouldUpdatePractitionerFromSync(
        { practitionerDentistId: null, practitionerEdited: false },
        "dentist-1"
      )
    ).toBe(true);
  });

  it("blocks overwrite when practitioner was manually edited", () => {
    expect(
      shouldUpdatePractitionerFromSync(
        { practitionerDentistId: "dentist-1", practitionerEdited: true },
        "dentist-2"
      )
    ).toBe(false);
  });

  it("blocks overwrite when practitioner already set", () => {
    expect(
      shouldUpdatePractitionerFromSync(
        { practitionerDentistId: "dentist-1", practitionerEdited: false },
        "dentist-2"
      )
    ).toBe(false);
  });
});

describe("shouldMarkPractitionerEdited", () => {
  it("is true only when dentist id changes", () => {
    expect(shouldMarkPractitionerEdited("a", "b")).toBe(true);
    expect(shouldMarkPractitionerEdited("a", "a")).toBe(false);
    expect(shouldMarkPractitionerEdited(null, null)).toBe(false);
  });
});
