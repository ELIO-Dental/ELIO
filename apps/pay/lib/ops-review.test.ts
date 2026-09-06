import { describe, expect, it } from "vitest";
import {
  buildDuplicateDiscrepancies,
  buildFinanceTermDiscrepancies,
  buildOpsReviewList,
  buildPriorPaidKeys,
  canAccessOpsReview,
  duplicateMatchKey,
  lineNeedsFinanceTerm,
} from "./ops-review";

describe("ops-review (Step 13)", () => {
  it("flags finance lines without term or fee as needs_finance_term", () => {
    expect(
      lineNeedsFinanceTerm({
        amountPence: 10000,
        isFinance: true,
        financeFeePence: null,
      })
    ).toBe(true);
    expect(
      lineNeedsFinanceTerm({
        amountPence: 10000,
        isFinance: true,
        financeFeePence: 500,
      })
    ).toBe(false);
    expect(
      lineNeedsFinanceTerm({
        amountPence: 10000,
        isFinance: true,
        financeTermMonths: 12,
      })
    ).toBe(false);
    const d = buildFinanceTermDiscrepancies([
      {
        amountPence: 20000,
        isFinance: true,
        financeFeePence: null,
        patientName: "Pat",
        invoiceDate: "2026-06-01",
        dentallyInvoiceId: "inv1",
      },
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]?.type).toBe("needs_finance_term");
    expect(d[0]?.notes).toContain("12");
  });

  it("detects possible duplicates by patient id + amount across months", () => {
    const prior = [
      {
        amountPence: 15000,
        dentallyPatientId: "p1",
        patientName: "Alex",
        paymentStatus: "paid",
        flagged: false,
      },
    ];
    const keys = buildPriorPaidKeys(prior);
    expect(keys.has(duplicateMatchKey({ dentallyPatientId: "p1", amountPence: 15000 }))).toBe(
      true
    );
    const dups = buildDuplicateDiscrepancies(
      [
        {
          amountPence: 15000,
          dentallyPatientId: "p1",
          patientName: "Alex",
          paymentStatus: "paid",
          invoiceDate: "2026-07-01",
        },
      ],
      keys,
      "prior-period-id"
    );
    expect(dups).toHaveLength(1);
    expect(dups[0]?.type).toBe("possible_duplicate");
    expect(dups[0]?.priorPeriodId).toBe("prior-period-id");
  });

  it("aggregates unpaid, finance, unmapped, and duplicates", () => {
    const list = buildOpsReviewList({
      currentLines: [
        {
          amountPence: 10000,
          patientName: "Unpaid Pat",
          paymentStatus: "unpaid",
          flagged: true,
          amountOutstandingPence: 10000,
          invoiceDate: "2026-06-02",
        },
        {
          amountPence: 50000,
          patientName: "Fin Pat",
          isFinance: true,
          financeFeePence: null,
          paymentStatus: "paid",
          invoiceDate: "2026-06-03",
        },
        {
          amountPence: 15000,
          dentallyPatientId: "p1",
          patientName: "Dup",
          paymentStatus: "paid",
          invoiceDate: "2026-06-04",
        },
      ],
      priorPaidLines: [
        {
          amountPence: 15000,
          dentallyPatientId: "p1",
          patientName: "Dup",
          paymentStatus: "paid",
        },
      ],
      priorPeriodId: "prev",
      fetchResultJson: {
        debug: {
          unmappedPractitioners: [
            {
              practitionerId: "999",
              amountPence: 1000,
              treatment: "X",
              invoiceDate: "2026-06-01",
            },
          ],
        },
      },
    });
    const types = list.map((i) => i.type);
    expect(types).toContain("invoiced_not_paid");
    expect(types).toContain("needs_finance_term");
    expect(types).toContain("unmapped_practitioner");
    expect(types).toContain("possible_duplicate");
  });

  it("ACL: pay:run-period required; pay:view alone denied (Step 30)", () => {
    expect(canAccessOpsReview(["pay:run-period"])).toBe(true);
    expect(canAccessOpsReview(["pay:view"])).toBe(false);
    expect(canAccessOpsReview([])).toBe(false);
    expect(canAccessOpsReview(["modules:use"])).toBe(false);
  });
});
