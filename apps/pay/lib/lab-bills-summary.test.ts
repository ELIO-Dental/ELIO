import { describe, expect, it } from "vitest";
import { buildLabBillMatrix, filterLabBills, summarizeLabBills } from "./lab-bills-summary";

const SAMPLE: Parameters<typeof filterLabBills>[0] = [
  {
    id: "1",
    labName: "Acme",
    dentistId: "d1",
    dentistName: "Dr A",
    amountPence: 10000,
    description: "Crown",
    fileUrl: null,
    billDate: "2025-03-10",
    paid: false,
    paidAt: null,
    createdAt: "2025-03-10T00:00:00.000Z",
  },
  {
    id: "2",
    labName: "Acme",
    dentistId: "d2",
    dentistName: "Dr B",
    amountPence: 5000,
    description: "Bridge",
    fileUrl: null,
    billDate: "2025-03-15",
    paid: true,
    paidAt: "2025-03-20T00:00:00.000Z",
    createdAt: "2025-03-15T00:00:00.000Z",
  },
  {
    id: "3",
    labName: "Zenith",
    dentistId: "d1",
    dentistName: "Dr A",
    amountPence: 7500,
    description: "Veneer",
    fileUrl: null,
    billDate: "2025-04-02",
    paid: false,
    paidAt: null,
    createdAt: "2025-04-02T00:00:00.000Z",
  },
];

describe("lab bills summary (Y3.3)", () => {
  it("filters by pay status and lab name", () => {
    const unpaidAcme = filterLabBills(SAMPLE, { payFilter: "unpaid", labName: "Acme" });
    expect(unpaidAcme).toHaveLength(1);
    expect(unpaidAcme[0]?.id).toBe("1");
  });

  it("summarizes totals", () => {
    const summary = summarizeLabBills(SAMPLE);
    expect(summary.totalPence).toBe(22500);
    expect(summary.paidPence).toBe(5000);
    expect(summary.unpaidCount).toBe(2);
  });

  it("builds month x lab matrix", () => {
    const matrix = buildLabBillMatrix(SAMPLE);
    expect(matrix.labNames).toEqual(["Acme", "Zenith"]);
    expect(matrix.monthKeys).toEqual(["2025-03", "2025-04"]);
    expect(matrix.lookup.get("2025-03")?.get("Acme")?.totalPence).toBe(15000);
    expect(matrix.lookup.get("2025-03")?.get("Acme")?.allPaid).toBe(false);
  });
});
