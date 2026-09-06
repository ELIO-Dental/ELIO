import { describe, expect, it } from "vitest";
import {
  getMonthSheetNames,
  parseTakingsCsv,
  parseTakingsDate,
  resolveTakingsSpreadsheetIds,
  DEFAULT_TAKINGS_SPREADSHEET_IDS,
} from "./google-sheets-takings";

describe("google-sheets-takings", () => {
  it("merges custom spreadsheet IDs over defaults", () => {
    const ids = resolveTakingsSpreadsheetIds(
      JSON.stringify({ "Moneeb Ahmad": "custom-id", "New Dentist": "new-id" })
    );
    expect(ids["Moneeb Ahmad"]).toBe("custom-id");
    expect(ids["New Dentist"]).toBe("new-id");
    expect(ids["Peter Throw"]).toBe(DEFAULT_TAKINGS_SPREADSHEET_IDS["Peter Throw"]);
  });

  it("returns defaults for empty or invalid JSON", () => {
    expect(resolveTakingsSpreadsheetIds("")).toEqual(DEFAULT_TAKINGS_SPREADSHEET_IDS);
    expect(resolveTakingsSpreadsheetIds("not-json")).toEqual(DEFAULT_TAKINGS_SPREADSHEET_IDS);
  });

  it("builds month sheet name variants", () => {
    const names = getMonthSheetNames(1, 2026);
    expect(names[0]).toBe("JANUARY 26");
    expect(names).toContain("January 2026");
    expect(names).toContain("Sheet1");
  });

  it("parses common date formats", () => {
    expect(parseTakingsDate("15/01/2026")).toBe("2026-01-15");
    expect(parseTakingsDate("2026-01-15")).toBe("2026-01-15");
    expect(parseTakingsDate("15 Jan 2026")).toBe("2026-01-15");
  });

  it("parses CSV rows for the target month", () => {
    const csv = [
      "Patient Name,Date,Fee,Treatment",
      "John Smith,15/01/2026,250.00,Crown",
      "Jane Doe,16/02/2026,95.00,Filling",
      "Total,,345,",
    ].join("\n");
    const rows = parseTakingsCsv(csv, 1, 2026);
    expect(rows).toEqual([
      { patientName: "John Smith", date: "2026-01-15", amount: 250, treatment: "Crown" },
    ]);
  });
});
