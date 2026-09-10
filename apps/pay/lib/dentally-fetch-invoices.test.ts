import { describe, expect, it } from "vitest";
import {
  buildAppointmentsListQueryParamsForPayPeriod,
  buildInvoiceListQueryParams,
  buildInvoiceListQueryParamsForPayPeriod,
  invoiceDatedOn,
  invoicePaidOn,
  isInvoiceEligibleForGrossInPeriod,
  isInvoiceFullyPaid,
  isInvoiceInDatedOnPeriod,
  isInvoiceInPaidOnPeriod,
  isInvoiceRelevantForPayPeriod,
  resolveInvoicePaymentStatus,
  shouldDiscardInvoiceAmount,
  toPracticeDateString,
} from "./dentally-fetch-invoices";

describe("buildInvoiceListQueryParams (Step 4)", () => {
  it("uses dated_on_after / dated_on_before + site_id", () => {
    expect(buildInvoiceListQueryParams("site-1", "2026-06-01", "2026-07-01")).toEqual({
      site_id: "site-1",
      dated_on_after: "2026-06-01",
      dated_on_before: "2026-07-01",
    });
  });
});

describe("buildInvoiceListQueryParamsForPayPeriod (Step 22)", () => {
  it("looks back 180 days so late settles are visible", () => {
    expect(buildInvoiceListQueryParamsForPayPeriod("site-1", "2026-05-01", "2026-06-01")).toEqual({
      site_id: "site-1",
      dated_on_after: "2025-11-02",
      dated_on_before: "2026-06-01",
    });
  });
});

describe("buildAppointmentsListQueryParamsForPayPeriod", () => {
  it("uses after/before, NOT start_date/end_date — Dentally silently ignores the latter and returns unfiltered history (live incident 2026-09-10)", () => {
    expect(buildAppointmentsListQueryParamsForPayPeriod("site-1", "2026-06-01", "2026-07-01")).toEqual({
      site_id: "site-1",
      after: "2026-06-01",
      before: "2026-07-01",
    });
  });

  it("does not include start_date or end_date keys", () => {
    const params = buildAppointmentsListQueryParamsForPayPeriod("site-1", "2026-06-01", "2026-07-01");
    expect(params).not.toHaveProperty("start_date");
    expect(params).not.toHaveProperty("end_date");
  });
});

describe("isInvoiceInDatedOnPeriod", () => {
  const start = "2026-06-01";
  const end = "2026-07-01";

  it("includes first and last day via dated_on only", () => {
    expect(isInvoiceInDatedOnPeriod({ dated_on: "2026-06-01" }, start, end)).toBe(true);
    expect(isInvoiceInDatedOnPeriod({ dated_on: "2026-06-30" }, start, end)).toBe(true);
  });

  it("excludes next month and missing dated_on", () => {
    expect(isInvoiceInDatedOnPeriod({ dated_on: "2026-07-01" }, start, end)).toBe(false);
    expect(isInvoiceInDatedOnPeriod({}, start, end)).toBe(false);
  });

  it("dated_on helper ignores paid_on (payment month is separate)", () => {
    expect(invoiceDatedOn({ dated_on: "2026-06-15" })).toBe("2026-06-15");
    expect(invoicePaidOn({ paid_on: "2026-05-10" })).toBe("2026-05-10");
    expect(isInvoiceInDatedOnPeriod({ dated_on: null }, start, end)).toBe(false);
  });
});

describe("Step 22 late payments by paid_on", () => {
  const marchStart = "2026-03-01";
  const marchEnd = "2026-04-01";
  const mayStart = "2026-05-01";
  const mayEnd = "2026-06-01";

  const lateSettle = {
    dated_on: "2026-03-15",
    paid_on: "2026-05-10",
    paid: true as const,
    balance: 0,
  };

  it("March dated / May paid → May only for relevance and gross", () => {
    expect(isInvoiceRelevantForPayPeriod(lateSettle, marchStart, marchEnd)).toBe(false);
    expect(isInvoiceEligibleForGrossInPeriod(lateSettle, marchStart, marchEnd)).toBe(false);

    expect(isInvoiceRelevantForPayPeriod(lateSettle, mayStart, mayEnd)).toBe(true);
    expect(isInvoiceEligibleForGrossInPeriod(lateSettle, mayStart, mayEnd)).toBe(true);
    expect(isInvoiceInPaidOnPeriod(lateSettle, mayStart, mayEnd)).toBe(true);
  });

  it("same-month dated+paid still included once", () => {
    const sameMonth = {
      dated_on: "2026-05-05",
      paid_on: "2026-05-20",
      paid: true as const,
      balance: 0,
    };
    expect(isInvoiceEligibleForGrossInPeriod(sameMonth, mayStart, mayEnd)).toBe(true);
    expect(isInvoiceRelevantForPayPeriod(sameMonth, mayStart, mayEnd)).toBe(true);
  });

  it("open invoice dated in period stays for §4.3 flags", () => {
    const open = {
      dated_on: "2026-03-15",
      paid_on: null,
      paid: false as const,
      balance: 100,
    };
    expect(isInvoiceRelevantForPayPeriod(open, marchStart, marchEnd)).toBe(true);
    expect(isInvoiceEligibleForGrossInPeriod(open, marchStart, marchEnd)).toBe(false);
    expect(isInvoiceRelevantForPayPeriod(open, mayStart, mayEnd)).toBe(false);
  });

  it("fully paid without paid_on in period is not gross", () => {
    expect(
      isInvoiceEligibleForGrossInPeriod(
        { paid: true, balance: 0, paid_on: null },
        mayStart,
        mayEnd
      )
    ).toBe(false);
  });
});

describe("isInvoiceFullyPaid + resolveInvoicePaymentStatus", () => {
  it("requires paid===true AND balance<=0", () => {
    expect(isInvoiceFullyPaid({ paid: true, balance: 0 })).toBe(true);
    expect(isInvoiceFullyPaid({ paid: true, balance: 10 })).toBe(false);
    expect(isInvoiceFullyPaid({ paid: false, balance: 0 })).toBe(false);
    expect(isInvoiceFullyPaid({ paid: true, amount_outstanding: 0 })).toBe(true);
  });

  it("maps fully paid / unpaid / partial for private share", () => {
    expect(resolveInvoicePaymentStatus({ paid: true, balance: 0, amount: 200 }, 200)).toEqual({
      status: "paid",
      amountPaid: 200,
      amountOutstanding: 0,
    });
    expect(resolveInvoicePaymentStatus({ paid: false, balance: 200, amount: 200 }, 150).status).toBe(
      "unpaid"
    );
    expect(
      resolveInvoicePaymentStatus({ paid: false, balance: 50, amount: 200 }, 200).status
    ).toBe("partial");
  });
});

describe("shouldDiscardInvoiceAmount", () => {
  it("drops zero and negative", () => {
    expect(shouldDiscardInvoiceAmount(0)).toBe(true);
    expect(shouldDiscardInvoiceAmount(-1)).toBe(true);
    expect(shouldDiscardInvoiceAmount(0.01)).toBe(false);
  });
});

describe("toPracticeDateString", () => {
  it("formats in Europe/London calendar date", () => {
    // UTC evening 31 May can still be 1 Jun in London during BST — use noon UTC for a stable date.
    expect(toPracticeDateString(new Date("2026-06-15T12:00:00.000Z"))).toBe("2026-06-15");
  });
});
