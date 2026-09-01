import { describe, expect, it } from "vitest";
import { isDentallyKeyConfigured } from "./dentally-integration-helpers";

describe("isDentallyKeyConfigured", () => {
  it("returns true when practice key is set", () => {
    expect(isDentallyKeyConfigured({ hasPracticeKey: true })).toBe(true);
  });

  it("returns true when env fallback key is set", () => {
    expect(
      isDentallyKeyConfigured({
        hasPracticeKey: false,
        envApiKey: "test-key",
      })
    ).toBe(true);
  });

  it("returns true for DENTALLY_API_TOKEN alias", () => {
    expect(
      isDentallyKeyConfigured({
        hasPracticeKey: false,
        envApiToken: "legacy-token",
      })
    ).toBe(true);
  });

  it("returns false when no key is available", () => {
    expect(isDentallyKeyConfigured({ hasPracticeKey: false })).toBe(false);
    expect(
      isDentallyKeyConfigured({
        hasPracticeKey: false,
        envApiKey: "   ",
        envApiToken: "",
      })
    ).toBe(false);
  });
});
