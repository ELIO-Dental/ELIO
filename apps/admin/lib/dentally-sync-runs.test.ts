import { describe, expect, it } from "vitest";
import { countDentallyRecordErrors, formatDentallySyncCounts, parseDentallySyncCounts } from "./dentally-sync-runs";

describe("dentally-sync-runs", () => {
  it("formats sync counts", () => {
    expect(
      formatDentallySyncCounts({
        patients: 12,
        appointments: 34,
        invoices: 5,
        payments: 0,
      })
    ).toBe("12 patients · 34 appts · 5 invoices");
  });

  it("parses partial counts", () => {
    expect(parseDentallySyncCounts({ patients: 1 })).toEqual({ patients: 1 });
  });

  it("counts record errors", () => {
    expect(countDentallyRecordErrors([{ id: 1 }, { id: 2 }])).toBe(2);
    expect(countDentallyRecordErrors(null)).toBe(0);
  });
});
