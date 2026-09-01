import { describe, expect, it } from "vitest";
import {
  discrepancyAmountForBreakdown,
  discrepancyTypeLabel,
  parsePayDiscrepancies,
  resolveAllDiscrepancies,
  resolveDiscrepancyAt,
  unresolvedDiscrepancyCount,
} from "./pay-discrepancies";

describe("pay discrepancies (Y2.6)", () => {
  const sample = [
    {
      type: "invoiced_not_paid" as const,
      patientName: "Alice",
      invoicedAmount: 120,
      paidAmount: 0,
      date: "2026-05-01",
      notes: "Invoice not paid",
    },
    {
      type: "in_log_not_system" as const,
      patientName: "Bob",
      invoicedAmount: 0,
      paidAmount: 0,
      logAmount: 80,
      date: "2026-05-02",
      notes: "In log only",
      resolved: true,
    },
  ];

  it("parses stored discrepancy json", () => {
    expect(parsePayDiscrepancies(sample)).toHaveLength(2);
  });

  it("labels legacy discrepancy types", () => {
    expect(discrepancyTypeLabel("in_log_not_system")).toBe("IN LOG ONLY");
    expect(discrepancyTypeLabel("partial_payment")).toBe("PARTIAL");
  });

  it("resolves one or all discrepancies", () => {
    expect(unresolvedDiscrepancyCount(sample)).toBe(1);
    expect(resolveDiscrepancyAt(sample, 0)[0]?.resolved).toBe(true);
    expect(unresolvedDiscrepancyCount(resolveAllDiscrepancies(sample))).toBe(0);
  });

  it("picks log amount for in_log_not_system breakdown adds", () => {
    expect(discrepancyAmountForBreakdown(sample[1]!)).toBe(80);
    expect(discrepancyAmountForBreakdown(sample[0]!)).toBe(120);
  });
});
