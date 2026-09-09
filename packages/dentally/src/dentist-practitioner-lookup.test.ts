import { describe, expect, it } from "vitest";
import { lookupDentistId, siteIdFromPaySettingsJson } from "./dentist-practitioner-lookup";

describe("dentist-practitioner-lookup", () => {
  it("reads dentally_site_id from pay settings json", () => {
    expect(siteIdFromPaySettingsJson({ dentally_site_id: " site-1 " })).toBe("site-1");
    expect(siteIdFromPaySettingsJson({})).toBeNull();
    expect(siteIdFromPaySettingsJson(null)).toBeNull();
  });

  it("looks up dentist ids from expanded map", () => {
    const map = new Map([
      ["189357", "d-peter"],
      ["396225", "d-peter"],
    ]);
    expect(lookupDentistId(map, "189357")).toBe("d-peter");
    expect(lookupDentistId(map, "396225")).toBe("d-peter");
    expect(lookupDentistId(map, "missing")).toBeNull();
    expect(lookupDentistId(map, null)).toBeNull();
  });
});
