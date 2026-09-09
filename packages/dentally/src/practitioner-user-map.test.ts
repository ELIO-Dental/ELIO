import { describe, expect, it } from "vitest";
import {
  expandDentistByPractitionerIds,
  expandIdSetWithPractitionerLinks,
  practitionerUserIdFromRaw,
} from "./practitioner-user-map";

describe("practitioner-user-map", () => {
  it("reads user id from nested user or user_id", () => {
    expect(practitionerUserIdFromRaw({ id: 1, user: { id: 99 } })).toBe("99");
    expect(practitionerUserIdFromRaw({ id: 1, user_id: 88 })).toBe("88");
    expect(practitionerUserIdFromRaw({ id: 1 })).toBeNull();
  });

  it("expands dentist lookup so practitioner resource id matches user-stored mapping", () => {
    const dentists = [
      { id: "d1", dentallyPractitionerId: "396225" }, // Peter user id
      { id: "d2", dentallyPractitionerId: "189361" }, // already practitioner id
    ];
    const links = new Map([
      ["189357", "396225"],
      ["189361", "396229"],
    ]);
    const map = expandDentistByPractitionerIds(dentists, links);
    expect(map.get("396225")?.id).toBe("d1");
    expect(map.get("189357")?.id).toBe("d1"); // invoice line practitioner id
    expect(map.get("189361")?.id).toBe("d2");
    expect(map.get("396229")?.id).toBe("d2"); // twin user id
  });

  it("expands therapist ids across practitioner/user spaces", () => {
    const therapists = new Set(["288298"]);
    const links = new Map([["288298", "999001"]]);
    const expanded = expandIdSetWithPractitionerLinks(therapists, links);
    expect(expanded.has("288298")).toBe(true);
    expect(expanded.has("999001")).toBe(true);
  });
});
