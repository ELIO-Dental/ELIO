import { describe, expect, it } from "vitest";
import {
  isPayDentallyFetchStale,
  PAY_DENTALLY_FETCH_STALE_MS,
  STALE_FETCH_ERROR_MESSAGE,
} from "./dentally-fetch-stale";

describe("dentally-fetch-stale", () => {
  const now = new Date("2026-09-09T12:00:00.000Z");

  it("treats missing startedAt as stale (recoverable stuck job)", () => {
    expect(isPayDentallyFetchStale(null, now)).toBe(true);
    expect(isPayDentallyFetchStale(undefined, now)).toBe(true);
  });

  it("is not stale within the window", () => {
    const started = new Date(now.getTime() - PAY_DENTALLY_FETCH_STALE_MS + 60_000);
    expect(isPayDentallyFetchStale(started, now)).toBe(false);
  });

  it("is stale at or beyond the window", () => {
    const started = new Date(now.getTime() - PAY_DENTALLY_FETCH_STALE_MS);
    expect(isPayDentallyFetchStale(started, now)).toBe(true);
    expect(STALE_FETCH_ERROR_MESSAGE).toMatch(/retry/i);
  });
});
