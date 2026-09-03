import { describe, expect, it, vi } from "vitest";
import {
  DENTALLY_SYNC_PHASES,
  EMPTY_SYNC_COUNTS,
  mergeSyncCounts,
} from "./sync";
import { runDentallySyncJobWithSteps, type DentallySyncStepRunner } from "./sync-job";

vi.mock("./resolve-api-key", () => ({
  getDentallyClientForPractice: vi.fn(),
  DentallySyncConfigError: class DentallySyncConfigError extends Error {},
}));

vi.mock("./sync-run", () => ({
  createDentallySyncRun: vi.fn(async () => ({ id: "run-1" })),
  finalizeDentallySyncRun: vi.fn(async () => undefined),
  failDentallySyncRun: vi.fn(async () => undefined),
  failLatestRunningDentallySyncRun: vi.fn(async () => ({ cleared: 1 })),
}));

vi.mock("./sync", async () => {
  const actual = await vi.importActual<typeof import("./sync")>("./sync");
  return {
    ...actual,
    syncPracticeDentallyPhase: vi.fn(async (_practiceId: string, phase: string) => ({
      counts: { ...actual.EMPTY_SYNC_COUNTS, patients: phase === "patients" ? 2 : 0, appointments: phase === "appointments" ? 3 : 0 },
      errors: [],
    })),
  };
});

describe("mergeSyncCounts", () => {
  it("sums phase counts", () => {
    expect(
      mergeSyncCounts(
        { ...EMPTY_SYNC_COUNTS, patients: 2 },
        { ...EMPTY_SYNC_COUNTS, appointments: 5, treatments: 1 }
      )
    ).toEqual({ ...EMPTY_SYNC_COUNTS, patients: 2, appointments: 5, treatments: 1 });
  });
});

describe("DENTALLY_SYNC_PHASES", () => {
  it("covers every resource in dependency order", () => {
    expect(DENTALLY_SYNC_PHASES).toEqual([
      "patients",
      "appointments",
      "invoices",
      "payments",
      "accounts",
      "payment_plans",
    ]);
  });
});

describe("runDentallySyncJobWithSteps", () => {
  it("runs create + one step per phase + finalize", async () => {
    const calls: string[] = [];
    const step: DentallySyncStepRunner = {
      run: async (id, fn) => {
        calls.push(id);
        return fn();
      },
    };

    const result = await runDentallySyncJobWithSteps(step, "seed-practice", "manual");

    expect(calls[0]).toBe("create-sync-run");
    expect(calls).toContain("sync-patients");
    expect(calls).toContain("sync-appointments");
    expect(calls).toContain("sync-invoices");
    expect(calls).toContain("sync-payments");
    expect(calls).toContain("sync-accounts");
    expect(calls).toContain("sync-payment_plans");
    expect(calls.at(-1)).toBe("finalize-sync-run");
    expect(result.counts.patients).toBe(2);
    expect(result.counts.appointments).toBe(3);
    expect(result.practiceId).toBe("seed-practice");
  });
});
