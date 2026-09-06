import { describe, expect, it } from "vitest";
import {
  parseUnmappedFromFetchResult,
  recordUnmappedPractitioner,
  unmappedHitsToDiscrepancies,
  unmappedHitsToList,
} from "./unmapped-practitioners";

describe("unmapped practitioners (Step 12)", () => {
  it("accumulates hits by practitioner id without inventing dentists", () => {
    const hits = new Map();
    recordUnmappedPractitioner(hits, {
      practitionerId: "999001",
      amountPence: 10000,
      treatment: "Crown",
      invoiceDate: "2026-06-01",
    });
    recordUnmappedPractitioner(hits, {
      practitionerId: "999001",
      amountPence: 5000,
      treatment: "Fill",
      invoiceDate: "2026-06-02",
    });
    const list = unmappedHitsToList(hits);
    expect(list).toHaveLength(1);
    expect(list[0]?.amountPence).toBe(15000);
    expect(list[0]?.treatment).toBe("Crown");
  });

  it("maps to review discrepancies with practitioner id in notes", () => {
    const d = unmappedHitsToDiscrepancies([
      {
        practitionerId: "777",
        amountPence: 20000,
        treatment: "Implant",
        invoiceDate: "2026-06-10",
        patientName: "Pat",
      },
    ]);
    expect(d[0]?.type).toBe("unmapped_practitioner");
    expect(d[0]?.notes).toContain("777");
    expect(d[0]?.paidAmount).toBe(0);
    expect(d[0]?.invoicedAmount).toBe(200);
  });

  it("parses durable hits from fetch result JSON", () => {
    const hits = parseUnmappedFromFetchResult({
      ok: true,
      debug: {
        unmappedPractitioners: [
          {
            practitionerId: "42",
            amountPence: 5000,
            treatment: "Crown",
            invoiceDate: "2026-06-01",
          },
        ],
      },
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.practitionerId).toBe("42");
  });

  it("falls back to legacy unmatchedClinicianIds", () => {
    const hits = parseUnmappedFromFetchResult({
      debug: { unmatchedClinicianIds: ["111", "222"] },
    });
    expect(hits.map((h) => h.practitionerId)).toEqual(["111", "222"]);
  });
});
