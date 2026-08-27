import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseCompassStatement } from "./compass-parser";

const FIXTURE = join(__dirname, "..", "test-fixtures", "JuneJuly Compass Statement.pdf");

describe("parseCompassStatement — real fixture (Refrence/JuneJuly Compass Statement.pdf)", () => {
  it("extracts the 'Current Financial Year' per-clinician UDA figure, not the cumulative one", async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseCompassStatement(buf);

    // Real values verified directly against the PDF's own printed text:
    // "112376 KAPOOR / Current Financial Year 2026/27 281.02" (NOT the practice-wide
    // "Cumulative Units for Dental Activity / Current Financial Year 2026/27 2,184.65").
    const kapoor = result.lines.find((l) => l.performerNumber === "112376");
    expect(kapoor?.udas).toBe(281.02);
    expect(kapoor?.udas).not.toBe(2184.65); // the cumulative practice-wide figure — must never leak in here

    const peThrow = result.lines.find((l) => l.performerNumber === "780995");
    expect(peThrow?.udas).toBe(350.12);
  });

  it("extracts superannuation from the 'Performers' Superannuation Contribution' section, not the later 'Employer's Contribution' section", async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseCompassStatement(buf);

    const kapoor = result.lines.find((l) => l.performerNumber === "112376");
    // Real printed value: "112376 KAPOOR @ 12.50% £593.35" — NOT the later
    // "Performer 112376 KAPOOR @ 14.38% £682.59" (Employer's Contribution, a different figure).
    expect(kapoor?.superannuationPence).toBe(59335);
    expect(kapoor?.superannuationPence).not.toBe(68259);

    const peThrow = result.lines.find((l) => l.performerNumber === "780995");
    expect(peThrow?.superannuationPence).toBe(61501);
  });

  it("matches by performer number, marks confident matches with both figures present", async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseCompassStatement(buf);

    const kapoor = result.lines.find((l) => l.performerNumber === "112376");
    expect(kapoor?.confident).toBe(true);
  });

  it("flags a clinician missing one of the two figures (UDAs present, no superannuation line) for manual review", async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseCompassStatement(buf);

    // Real fixture: 701874 M AHMAD has a UDA figure but never appears in the
    // Performers' Superannuation Contribution section — must not be silently defaulted.
    const ahmad = result.lines.find((l) => l.performerNumber === "701874");
    expect(ahmad?.udas).toBe(41);
    expect(ahmad?.superannuationPence).toBeNull();
    expect(ahmad?.confident).toBe(false);
  });

  it("extracts the printed activity period as-is (display/audit only)", async () => {
    const buf = readFileSync(FIXTURE);
    const result = await parseCompassStatement(buf);
    expect(result.activityPeriodStart).toBe("2026-05-20");
    expect(result.activityPeriodEnd).toBe("2026-06-16");
  });

  it("flags an unknown performer number for manual review instead of guessing", async () => {
    const buf = readFileSync(FIXTURE);
    const knownDentists = new Map<string, string>([
      ["112376", "KAPOOR"],
      // 780995 deliberately omitted — simulates an unregistered/unknown performer number.
    ]);
    const result = await parseCompassStatement(buf, knownDentists);
    const unknown = result.lines.find((l) => l.performerNumber === "780995");
    expect(unknown?.confident).toBe(false);
  });

  it("flags a performer number matched to a DIFFERENT name than previously recorded", async () => {
    const buf = readFileSync(FIXTURE);
    const knownDentists = new Map<string, string>([
      ["112376", "SOMEONE ELSE ENTIRELY"], // simulates a name mismatch signal
    ]);
    const result = await parseCompassStatement(buf, knownDentists);
    const mismatched = result.lines.find((l) => l.performerNumber === "112376");
    expect(mismatched?.confident).toBe(false);
  });
});
