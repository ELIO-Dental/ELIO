import { describe, expect, it } from "vitest";
import { extractUdasFromNhsText } from "./nhs-uda-from-text";

describe("extractUdasFromNhsText", () => {
  it("extracts UDAs from per-clinician section", () => {
    const text = `
Units of Dental Activity per Clinician
701874 M AHMAD
Current Financial Year 2025/26
232.40
702001 H SAQIB
Current Financial Year 2025/26
100.00
`;
    const hits = extractUdasFromNhsText(text, [
      { id: "d1", name: "Moneeb Ahmad", nhsPerformerNumber: "701874", udaRatePence: 2800 },
      { id: "d2", name: "Hisham Saqib", nhsPerformerNumber: "702001", udaRatePence: 2800 },
    ]);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.udas).toBe(232.4);
    expect(hits[0]?.nhsEarningsPence).toBe(Math.round(232.4 * 2800));
    expect(hits[1]?.udas).toBe(100);
  });
});
