import { describe, expect, it } from "vitest";
import { aggregateStarlingPayments, generateStarlingCsv } from "./bulk-payment";
import type { UnpaidBillRow } from "./bulk-payment";

describe("bulk payment Starling CSV (Y3.4)", () => {
  const sampleBills: UnpaidBillRow[] = [
    {
      id: "1",
      entity_name: "Acme Lab",
      type: "lab",
      amount: 50,
      amountPence: 5000,
      date: "2026-01-15",
      description: "Crown",
      account_name: "Acme Lab Ltd",
      sort_code: "11-22-33",
      account_number: "12345678",
    },
    {
      id: "2",
      entity_name: "Acme Lab",
      type: "lab",
      amount: 25.5,
      amountPence: 2550,
      date: "2026-01-20",
      description: "Bridge",
      account_name: "Acme Lab Ltd",
      sort_code: "11-22-33",
      account_number: "12345678",
    },
  ];

  it("aggregates unpaid bills by entity name", () => {
    const payments = aggregateStarlingPayments(sampleBills);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount).toBe(75.5);
    expect(payments[0]?.entity_name).toBe("Acme Lab");
  });

  it("generates Starling bank CSV with dashes stripped from sort code", () => {
    const csv = generateStarlingCsv(aggregateStarlingPayments(sampleBills));
    expect(csv).toContain("Payee Name,Sort Code,Account Number,Amount,Reference");
    expect(csv).toContain('"Acme Lab Ltd","112233","12345678","75.50","Acme Lab"');
  });
});
