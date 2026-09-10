import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncResult } from "./sync";

const findFirst = vi.fn();
const updateMany = vi.fn();
const update = vi.fn();
const practiceUpdate = vi.fn();

vi.mock("@elio/db", () => ({
  prisma: {
    dentallySyncRun: {
      findFirst: (...args: unknown[]) => findFirst(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
    practice: {
      update: (...args: unknown[]) => practiceUpdate(...args),
    },
  },
  Prisma: { JsonNull: "JsonNull" },
}));

import {
  resolveRunStatus,
  STALE_RUNNING_MS,
  getLatestDentallySyncRun,
  hasActiveDentallySyncRun,
  finalizeDentallySyncRun,
} from "./sync-run";

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
  it("sits just past Inngest's own 12h function finish timeout, so the cron backstop can never contradict a run Inngest itself still considers live", () => {
    expect(STALE_RUNNING_MS).toBe(12.5 * 60 * 60 * 1000);
    expect(STALE_RUNNING_MS).toBeGreaterThan(12 * 60 * 60 * 1000);
  });
});

// Regression coverage for the 2026-09-10 live incident: a run whose heartbeat had
// gone quiet for a while (Inngest retry backoff, not a dead worker) got auto-failed
// on an ordinary page load, while the real background job kept working and kept
// writing to the same row — proof that reads must never mutate status.
describe("getLatestDentallySyncRun / hasActiveDentallySyncRun are pure reads", () => {
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue({ id: "run-1", status: "RUNNING" });
    updateMany.mockReset();
    update.mockReset();
    practiceUpdate.mockReset();
  });

  it("getLatestDentallySyncRun never writes, no matter how old the row is", async () => {
    findFirst.mockResolvedValue({
      id: "run-1",
      status: "RUNNING",
      startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000), // 6h old, still RUNNING
      lastHeartbeatAt: new Date(Date.now() - 45 * 60 * 1000), // no heartbeat in 45m
    });

    const result = await getLatestDentallySyncRun("practice-1");

    expect(result?.status).toBe("RUNNING");
    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(practiceUpdate).not.toHaveBeenCalled();
  });

  it("hasActiveDentallySyncRun never writes either", async () => {
    await hasActiveDentallySyncRun("practice-1");

    expect(updateMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(practiceUpdate).not.toHaveBeenCalled();
  });
});

describe("finalizeDentallySyncRun", () => {
  beforeEach(() => {
    update.mockReset().mockResolvedValue(undefined);
    practiceUpdate.mockReset().mockResolvedValue(undefined);
  });

  it("clears errorMessage on a clean finish, so a prior stale-sweep's leftover error text can never linger under a SUCCESS badge", async () => {
    const result: SyncResult = {
      practiceId: "practice-1",
      startedAt: new Date(),
      finishedAt: new Date(),
      counts: { patients: 5, appointments: 0, invoices: 0, treatments: 0, payments: 0, accounts: 0, paymentPlans: 0 },
      errors: [],
    };

    await finalizeDentallySyncRun("run-1", result);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "SUCCESS", errorMessage: null }),
      })
    );
  });
});
