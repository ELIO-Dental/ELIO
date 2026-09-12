import { describe, expect, it } from "vitest";
import { londonMidnightUtc } from "./dentally-occupancy-service";

describe("londonMidnightUtc", () => {
  it("is exactly midnight UTC during GMT (winter)", () => {
    expect(londonMidnightUtc("2026-01-15").toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("is 23:00 UTC the previous day during BST (summer) — the bug this fixes", () => {
    // London is UTC+1 in June, so London midnight on the 15th is 23:00 UTC on the 14th.
    // `new Date("2026-06-15T00:00:00Z")` (the old, buggy construction) would be an hour late.
    expect(londonMidnightUtc("2026-06-15").toISOString()).toBe("2026-06-14T23:00:00.000Z");
  });

  it("round-trips through toPracticeDateString back to the same calendar date", () => {
    const utc = londonMidnightUtc("2026-06-15");
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(utc);
    expect(formatted).toBe("2026-06-15");
  });
});
