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
    syncPracticeDentallyPhasePage: vi.fn(
      async (_practiceId: string, phase: string, page: number) => ({
        counts: {
          ...actual.EMPTY_SYNC_COUNTS,
          patients: phase === "patients" && page === 1 ? 2 : 0,
          appointments: phase === "appointments" && page === 1 ? 3 : 0,
        },
        errors: [],
        page,
        // One page per phase — exercises the page-step loop without multi-page noise.
        done: true,
        nextPage: page,
      })
    ),
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
  it("runs create + one page step per phase + finalize", async () => {
    const calls: string[] = [];
    const step: DentallySyncStepRunner = {
      run: async (id, fn) => {
        calls.push(id);
        return fn();
      },
    };

    const result = await runDentallySyncJobWithSteps(step, "seed-practice", "manual");

    expect(calls[0]).toBe("create-sync-run");
    expect(calls).toContain("sync-patients-p1");
    expect(calls).toContain("sync-appointments-p1");
    expect(calls).toContain("sync-invoices-p1");
    expect(calls).toContain("sync-payments-p1");
    expect(calls).toContain("sync-accounts-p1");
    expect(calls).toContain("sync-payment_plans-p1");
    expect(calls).not.toContain("sync-patients");
    expect(calls.at(-1)).toBe("finalize-sync-run");
    expect(result.counts.patients).toBe(2);
    expect(result.counts.appointments).toBe(3);
    expect(result.practiceId).toBe("seed-practice");
  });

  it("loops pages until done for a phase", async () => {
    const { syncPracticeDentallyPhasePage } = await import("./sync");
    vi.mocked(syncPracticeDentallyPhasePage).mockImplementation(
      async (_practiceId: string, phase: string, page: number) => ({
        counts: { ...EMPTY_SYNC_COUNTS, patients: phase === "patients" ? 1 : 0 },
        errors: [],
        page,
        done: phase !== "patients" || page >= 3,
        nextPage: page + 1,
      })
    );

    const calls: string[] = [];
    const step: DentallySyncStepRunner = {
      run: async (id, fn) => {
        calls.push(id);
        return fn();
      },
    };

    const result = await runDentallySyncJobWithSteps(step, "seed-practice", "manual");

    expect(calls.filter((c) => c.startsWith("sync-patients-"))).toEqual([
      "sync-patients-p1",
      "sync-patients-p2",
      "sync-patients-p3",
    ]);
    expect(result.counts.patients).toBe(3);
  });
});
