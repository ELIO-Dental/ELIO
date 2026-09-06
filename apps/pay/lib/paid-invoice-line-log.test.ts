import { describe, expect, it } from "vitest";
import {
  buildPaidInvoiceId,
  buildPaidLineKey,
  buildPaidLogLineKey,
  buildPaidLogLookup,
  buildSeedCandidatesFromLines,
  filterLinesNotAlreadyPaid,
  hasStablePaidIdentity,
  isAlreadyPaidInOtherPeriod,
  summarizeSeedDryRun,
  paidLogCompositeKey,
  resolvePaidIdentity,
} from "./paid-invoice-line-log";

describe("paid-invoice-line-log (Step 14)", () => {
  it("requires Dentally invoice id — no amount orphans", () => {
    expect(buildPaidInvoiceId({ dentallyInvoiceId: "inv-1", amountPence: 10000 })).toBe("inv-1");
    expect(buildPaidInvoiceId({ amountPence: 10000 })).toBeNull();
    expect(hasStablePaidIdentity({ amountPence: 10000 })).toBe(false);
    expect(resolvePaidIdentity({ dentallyInvoiceId: "inv-1", amountPence: 10000 })).toEqual({
      invoiceId: "inv-1",
      lineKey: "amt:10000",
    });
  });

  it("lineKey is amount-only by default (ignores mutable treatment name)", () => {
    expect(
      buildPaidLineKey({
        dentallyInvoiceId: "inv-1",
        treatmentDescription: "Crown ",
        amountPence: 10000,
      })
    ).toBe("amt:10000");
    expect(
      buildPaidLineKey({
        dentallyInvoiceId: "inv-1",
        treatmentDescription: "Crown UPDATED",
        amountPence: 10000,
      })
    ).toBe("amt:10000");
  });

  it("prefers Dentally item id and occurrence suffix for same-amount lines", () => {
    expect(buildPaidLineKey({ amountPence: 10000, dentallyItemId: "item-9" })).toBe("di:item-9");
    expect(buildPaidLineKey({ amountPence: 10000, amountOccurrence: 0 })).toBe("amt:10000");
    expect(buildPaidLineKey({ amountPence: 10000, amountOccurrence: 1 })).toBe("amt:10000#1");
  });

  it("scopes paid-log keys by dentist; legacy amt keys still match same dentist", () => {
    expect(buildPaidLogLineKey({ amountPence: 10000 }, "d1")).toBe("amt:10000:d:d1");
    expect(resolvePaidIdentity({ dentallyInvoiceId: "inv-1", amountPence: 10000 }, "d1")).toEqual({
      invoiceId: "inv-1",
      lineKey: "amt:10000:d:d1",
    });

    const legacyLookup = buildPaidLogLookup([
      {
        invoiceId: "inv-1",
        lineKey: "amt:10000",
        payPeriodId: "period-old",
        amountPence: 10000,
        dentistId: "d1",
      },
    ]);
    const line = { dentallyInvoiceId: "inv-1", amountPence: 10000 };
    expect(isAlreadyPaidInOtherPeriod(line, legacyLookup, "period-new", "d1")).toBeTruthy();
    // Other dentist on same invoice+amount must not be blocked by d1's legacy row
    expect(isAlreadyPaidInOtherPeriod(line, legacyLookup, "period-new", "d2")).toBeNull();
  });

  it("skips lines already paid in another period; allows same period", () => {
    const lookup = buildPaidLogLookup([
      {
        invoiceId: "inv-1",
        lineKey: "amt:10000:d:d1",
        payPeriodId: "period-old",
        amountPence: 10000,
        dentistId: "d1",
      },
    ]);
    const line = {
      dentallyInvoiceId: "inv-1",
      treatmentDescription: "Crown",
      amountPence: 10000,
    };
    expect(isAlreadyPaidInOtherPeriod(line, lookup, "period-new", "d1")).toBeTruthy();
    expect(isAlreadyPaidInOtherPeriod(line, lookup, "period-old", "d1")).toBeNull();
    // No invoice id → cannot match
    expect(
      isAlreadyPaidInOtherPeriod({ amountPence: 10000 }, lookup, "period-new", "d1")
    ).toBeNull();

    const { kept, skipped } = filterLinesNotAlreadyPaid(
      [line, { dentallyInvoiceId: "inv-2", amountPence: 5000 }],
      lookup,
      "period-new",
      "d1"
    );
    expect(skipped).toHaveLength(1);
    expect(kept).toHaveLength(1);
    expect(buildPaidInvoiceId(kept[0]!)).toBe("inv-2");
  });

  it("seed dry-run skips draft and missing invoice ids; uses dentist-scoped keys", () => {
    const { candidates, skippedNoInvoiceId, skippedDraft } = buildSeedCandidatesFromLines([
      {
        dentallyInvoiceId: "a",
        amountPence: 100,
        dentistId: "d1",
        payPeriodId: "p1",
        paymentStatus: "paid",
        periodStatus: "LOCKED",
      },
      {
        dentallyInvoiceId: "b",
        amountPence: 200,
        dentistId: "d1",
        payPeriodId: "p1",
        paymentStatus: "paid",
        periodStatus: "DRAFT",
      },
      {
        amountPence: 300,
        dentistId: "d1",
        payPeriodId: "p1",
        paymentStatus: "paid",
        periodStatus: "LOCKED",
      },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.lineKey).toBe("amt:100:d:d1");
    expect(skippedDraft).toBe(1);
    expect(skippedNoInvoiceId).toBe(1);
    const existing = new Set([paidLogCompositeKey("a", "amt:100:d:d1")]);
    const report = summarizeSeedDryRun(candidates, existing);
    expect(report.wouldInsert).toBe(0);
    expect(report.wouldSkipExisting).toBe(1);
  });
});
