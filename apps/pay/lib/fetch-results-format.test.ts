import { describe, expect, it } from "vitest";
import { formatFetchSkippedLine } from "./fetch-results-format";

describe("fetch results banner helpers (Y2.2)", () => {
  it("formats skipped non-clinician and NHS counts", () => {
    expect(formatFetchSkippedLine({ skippedNonClinician: 2, skippedNhs: 5 })).toBe(
      "Skipped: 2 non-clinician, 5 NHS"
    );
  });

  it("returns null when nothing was skipped", () => {
    expect(formatFetchSkippedLine({ skippedNonClinician: 0, skippedNhs: 0 })).toBeNull();
  });
});
