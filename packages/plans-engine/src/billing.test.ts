import { describe, it, expect, vi } from "vitest";
import {
  billingPeriodFromDate,
  chargeIdempotencyKey,
  reconcile,
  idempotentCreate,
  type GoCardlessPayment,
  type ExpectedCharge,
  type LocalPayment,
} from "./billing";

describe("billingPeriodFromDate (Europe/London)", () => {
  it("maps a mid-month UTC date to that month", () => {
    expect(billingPeriodFromDate(new Date("2025-06-15T12:00:00Z"))).toBe("2025-06");
  });

  it("maps a late-night-UTC date during BST to the correct LOCAL month", () => {
    // 2025-06-30T23:30:00Z is 2025-07-01 00:30 BST -> belongs to JULY.
    expect(billingPeriodFromDate(new Date("2025-06-30T23:30:00Z"))).toBe("2025-07");
  });

  it("keeps a GMT-winter late-night UTC date in the same month", () => {
    // 2025-01-31T23:30:00Z is still 2025-01-31 23:30 GMT (no offset) -> January.
    expect(billingPeriodFromDate(new Date("2025-01-31T23:30:00Z"))).toBe("2025-01");
  });

  it("zero-pads single-digit months", () => {
    expect(billingPeriodFromDate(new Date("2025-03-10T09:00:00Z"))).toBe("2025-03");
  });
});

describe("chargeIdempotencyKey", () => {
  it("is stable for the same enrolment+period (retry-safe)", () => {
    expect(chargeIdempotencyKey("ppe_1", "2025-06")).toBe(chargeIdempotencyKey("ppe_1", "2025-06"));
  });
  it("differs across periods", () => {
    expect(chargeIdempotencyKey("ppe_1", "2025-06")).not.toBe(chargeIdempotencyKey("ppe_1", "2025-07"));
  });
});

describe("reconcile", () => {
  const period = "2025-06";
  const expected: ExpectedCharge[] = [
    { patientPlanEnrolmentId: "ppe_1", billingPeriod: period, amountPence: 1999 },
  ];

  it("passes clean when GoCardless matches expected exactly (one charge)", () => {
    const gocardless: GoCardlessPayment[] = [
      { id: "PM1", amountPence: 1999, status: "confirmed", chargeDate: "2025-06-01", patientPlanEnrolmentId: "ppe_1" },
    ];
    const local: LocalPayment[] = [
      { patientPlanEnrolmentId: "ppe_1", billingPeriod: period, gocardlessPaymentId: "PM1", amountPence: 1999, status: "confirmed" },
    ];
    expect(reconcile({ billingPeriod: period, expected, local, gocardless })).toEqual([]);
  });

  it("flags MISSING when an expected charge has no GoCardless payment", () => {
    const result = reconcile({ billingPeriod: period, expected, local: [], gocardless: [] });
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("MISSING");
    expect(result[0]?.patientPlanEnrolmentId).toBe("ppe_1");
  });

  it("flags DUPLICATE when GoCardless charged the same enrolment twice in a period (double-charge)", () => {
    const gocardless: GoCardlessPayment[] = [
      { id: "PM1", amountPence: 1999, status: "confirmed", chargeDate: "2025-06-01", patientPlanEnrolmentId: "ppe_1" },
      { id: "PM2", amountPence: 1999, status: "confirmed", chargeDate: "2025-06-01", patientPlanEnrolmentId: "ppe_1" },
    ];
    const result = reconcile({ billingPeriod: period, expected, local: [], gocardless });
    expect(result.some((m) => m.type === "DUPLICATE")).toBe(true);
  });

  it("flags AMOUNT when GoCardless charged a different amount", () => {
    const gocardless: GoCardlessPayment[] = [
      { id: "PM1", amountPence: 2500, status: "confirmed", chargeDate: "2025-06-01", patientPlanEnrolmentId: "ppe_1" },
    ];
    const result = reconcile({ billingPeriod: period, expected, local: [], gocardless });
    expect(result.some((m) => m.type === "AMOUNT")).toBe(true);
  });

  it("flags STATUS when local status differs from GoCardless", () => {
    const gocardless: GoCardlessPayment[] = [
      { id: "PM1", amountPence: 1999, status: "failed", chargeDate: "2025-06-01", patientPlanEnrolmentId: "ppe_1" },
    ];
    const local: LocalPayment[] = [
      { patientPlanEnrolmentId: "ppe_1", billingPeriod: period, gocardlessPaymentId: "PM1", amountPence: 1999, status: "confirmed" },
    ];
    const result = reconcile({ billingPeriod: period, expected, local, gocardless });
    expect(result.some((m) => m.type === "STATUS")).toBe(true);
  });

  it("flags UNEXPECTED when GoCardless charged an enrolment we did not expect", () => {
    const gocardless: GoCardlessPayment[] = [
      { id: "PMX", amountPence: 1999, status: "confirmed", chargeDate: "2025-06-01", patientPlanEnrolmentId: "ppe_ROGUE" },
    ];
    const result = reconcile({ billingPeriod: period, expected, local: [], gocardless });
    expect(result.some((m) => m.type === "UNEXPECTED")).toBe(true);
  });
});

// BUG-1 acceptance criteria (project-docs/00_SCOPE.md, FR-L2): "automated tests cover
// double-trigger, retry-after-timeout, webhook-replay and failed-then-retried scenarios;
// every test must prove exactly ONE charge exists per patient per billing period."
//
// idempotentCreate is the exact helper the real webhook route (createPaymentFromGoCardless,
// and the WebhookEvent replay guard) is built on — these tests exercise it directly against
// a simulated unique-constrained store (standing in for PlanPayment's
// @@unique([patientPlanEnrolmentId, billingPeriod])), not a parallel reimplementation of the
// logic. Ported directly from ElioPlans' src/lib/billing.test.ts.
describe("idempotentCreate — BUG-1 double-trigger / webhook-replay / retry safety", () => {
  // A tiny in-memory stand-in for a table with a unique constraint on `key`, so
  // "duplicate" is a real, provable outcome rather than an assumption.
  function makeUniqueStore<T extends { key: string }>() {
    const rows: T[] = [];
    return {
      rows,
      create: async (row: T) => {
        if (rows.some((r) => r.key === row.key)) {
          const err = new Error("Unique constraint failed") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        rows.push(row);
        return row;
      },
      find: async (key: string) => rows.find((r) => r.key === key) ?? null,
    };
  }

  const isP2002 = (e: unknown) => e instanceof Error && (e as { code?: string }).code === "P2002";

  it("normal creation succeeds when nothing exists yet", async () => {
    const store = makeUniqueStore<{ key: string; amountPence: number }>();
    const result = await idempotentCreate({
      create: () => store.create({ key: "ppe1::2026-06", amountPence: 5000 }),
      findExisting: () => store.find("ppe1::2026-06"),
      isUniqueConstraintError: isP2002,
    });
    expect(result.amountPence).toBe(5000);
    expect(store.rows).toHaveLength(1);
  });

  it("double-trigger: calling charge creation twice for the same key creates exactly ONE row", async () => {
    const store = makeUniqueStore<{ key: string; amountPence: number }>();
    const attempt = () =>
      idempotentCreate({
        create: () => store.create({ key: "ppe1::2026-06", amountPence: 5000 }),
        findExisting: () => store.find("ppe1::2026-06"),
        isUniqueConstraintError: isP2002,
      });

    const first = await attempt();
    const second = await attempt(); // the "double trigger"

    expect(store.rows).toHaveLength(1); // exactly ONE charge, per the acceptance bar
    expect(first).toEqual(second);
  });

  it("webhook-replay: two concurrent calls for the same event settle to ONE row, neither throws", async () => {
    const store = makeUniqueStore<{ key: string; amountPence: number }>();
    const attempt = () =>
      idempotentCreate({
        create: () => store.create({ key: "evt_123", amountPence: 4500 }),
        findExisting: () => store.find("evt_123"),
        isUniqueConstraintError: isP2002,
      });

    // Simulates GoCardless delivering the same webhook twice back-to-back.
    const [a, b] = await Promise.all([attempt(), attempt()]);
    expect(store.rows).toHaveLength(1);
    expect(a.key).toBe(b.key);
  });

  it("retry-after-timeout: a client retry after a slow-but-successful first attempt does not duplicate", async () => {
    const store = makeUniqueStore<{ key: string; amountPence: number }>();
    // First "attempt" succeeded but the caller never saw the response (timeout) and retries.
    await store.create({ key: "ppe2::2026-07", amountPence: 3000 });

    const retryResult = await idempotentCreate({
      create: () => store.create({ key: "ppe2::2026-07", amountPence: 3000 }),
      findExisting: () => store.find("ppe2::2026-07"),
      isUniqueConstraintError: isP2002,
    });

    expect(store.rows).toHaveLength(1);
    expect(retryResult.amountPence).toBe(3000);
  });

  it("failed-then-retried: a genuinely failed create (not a race) still throws, not swallowed", async () => {
    const alwaysFails = vi.fn(async () => {
      throw new Error("network error"); // NOT a P2002 — a real failure
    });
    await expect(
      idempotentCreate({
        create: alwaysFails,
        findExisting: async () => null,
        isUniqueConstraintError: isP2002,
      })
    ).rejects.toThrow("network error");
    expect(alwaysFails).toHaveBeenCalledOnce();
  });

  it("a P2002 with no findable existing row re-throws instead of silently swallowing", async () => {
    const create = vi.fn(async () => {
      const err = new Error("Unique constraint failed") as Error & { code: string };
      err.code = "P2002";
      throw err;
    });
    await expect(
      idempotentCreate({ create, findExisting: async () => null, isUniqueConstraintError: isP2002 })
    ).rejects.toThrow("Unique constraint failed");
  });

  it("concurrent-attempt simulation proves exactly ONE PlanPayment row per patient per billing period", async () => {
    // Simulates the DB-level @@unique([patientPlanEnrolmentId, billingPeriod])
    // constraint on PlanPayment directly, using the real idempotencyKey shape.
    const store = makeUniqueStore<{ key: string; patientPlanEnrolmentId: string; billingPeriod: string; amountPence: number }>();
    const patientPlanEnrolmentId = "ppe_concurrent";
    const billingPeriod = "2026-08";
    const key = chargeIdempotencyKey(patientPlanEnrolmentId, billingPeriod);

    const attempt = () =>
      idempotentCreate({
        create: () => store.create({ key, patientPlanEnrolmentId, billingPeriod, amountPence: 1999 }),
        findExisting: () => store.find(key),
        isUniqueConstraintError: isP2002,
      });

    // Five concurrent attempts (double-trigger + webhook replay combined).
    const results = await Promise.all([attempt(), attempt(), attempt(), attempt(), attempt()]);

    expect(store.rows).toHaveLength(1);
    for (const r of results) {
      expect(r.patientPlanEnrolmentId).toBe(patientPlanEnrolmentId);
      expect(r.billingPeriod).toBe(billingPeriod);
    }
  });
});
