import { describe, expect, it } from "vitest";
import type { SyncResult } from "./sync";
import { resolveRunStatus, STALE_RUNNING_MS } from "./sync-run";

describe("resolveRunStatus", () => {
  const base: SyncResult = {
    practiceId: "p1",
    startedAt: new Date(),
    finishedAt: new Date(),
    counts: { patients: 0, appointments: 0, invoices: 0, treatments: 0, payments: 0, accounts: 0, paymentPlans: 0 },
    errors: [],
  };

  it("returns SUCCESS when no errors", () => {
    expect(resolveRunStatus({ ...base, counts: { patients: 5, appointments: 0, invoices: 0, treatments: 0, payments: 0, accounts: 0, paymentPlans: 0 } })).toBe(
      "SUCCESS"
    );
  });

  it("returns PARTIAL when some records synced but errors exist", () => {
    expect(
      resolveRunStatus({
        ...base,
        counts: { patients: 2, appointments: 0, invoices: 0, treatments: 0, payments: 0, accounts: 0, paymentPlans: 0 },
        errors: [{ resource: "patient", dentallyId: "1", message: "fail" }],
      })
    ).toBe("PARTIAL");
  });

  it("returns FAILED when nothing synced and errors exist", () => {
    expect(
      resolveRunStatus({
        ...base,
        errors: [{ resource: "patient", dentallyId: "1", message: "fail" }],
      })
    ).toBe("FAILED");
  });
});

describe("STALE_RUNNING_MS", () => {
  it("is 30 minutes so Sync now unlocks after abandoned jobs", () => {
    expect(STALE_RUNNING_MS).toBe(30 * 60 * 1000);
  });
});
