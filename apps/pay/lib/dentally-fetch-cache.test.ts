import { describe, expect, it, vi } from "vitest";
import {
  filterAppointmentsOnOrBefore,
  mapWithConcurrency,
  uniquePatientIdsForFetch,
  withPatientCache,
} from "./dentally-fetch-cache";

describe("uniquePatientIdsForFetch", () => {
  it("dedupes and drops blanks", () => {
    expect(uniquePatientIdsForFetch(["1", "1", "", "2", "2"])).toEqual(["1", "2"]);
  });

  it("returns all unique ids when max omitted (Step 6b — no silent drop)", () => {
    const ids = Array.from({ length: 600 }, (_, i) => String(i));
    expect(uniquePatientIdsForFetch(ids)).toHaveLength(600);
  });

  it("caps only when max is explicitly passed", () => {
    const ids = Array.from({ length: 10 }, (_, i) => String(i));
    expect(uniquePatientIdsForFetch(ids, 3)).toEqual(["0", "1", "2"]);
  });
});

describe("mapWithConcurrency", () => {
  it("maps all items and respects concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});

describe("withPatientCache", () => {
  it("invokes factory only once per patient id", async () => {
    const cache = new Map<string, string[]>();
    const factory = vi.fn(async () => ["a"]);
    const first = await withPatientCache(cache, "p1", factory);
    const second = await withPatientCache(cache, "p1", factory);
    expect(first).toEqual(["a"]);
    expect(second).toEqual(["a"]);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});

describe("filterAppointmentsOnOrBefore", () => {
  it("keeps appointments on or before therapy date", () => {
    const hist = [
      { starts_at: "2026-03-01T10:00:00Z" },
      { starts_at: "2026-03-15T10:00:00Z" },
      { starts_at: "2026-03-20T10:00:00Z" },
    ];
    expect(filterAppointmentsOnOrBefore(hist, "2026-03-15")).toHaveLength(2);
  });
});
