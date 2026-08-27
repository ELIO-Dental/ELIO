/**
 * Pure billing helpers for ElioPlans membership charges (BUG-1).
 *
 * Ported faithfully from ElioPlans' `src/lib/billing.ts`. These functions contain
 * no database or network calls so they can be unit tested directly. They define:
 *   - how a GoCardless charge date maps to a billing period ("YYYY-MM"),
 *   - the idempotency key for a membership charge, and
 *   - the reconciliation comparison between ELIO's expected charges and
 *     GoCardless's actual payments.
 *
 * Field-name note: ElioPlans' `Payment.patientPlanId` is renamed
 * `PlanPayment.patientPlanEnrolmentId` in the merged schema
 * (packages/db/prisma/schema.prisma), and amounts are stored as `amountPence`
 * (Int) rather than a Decimal pounds figure — this file uses the new names
 * throughout, but the logic (including the BUG-1 idempotency key shape) is
 * unchanged.
 */

const PRACTICE_TZ = "Europe/London";

/**
 * Map a charge date to its billing period, expressed as "YYYY-MM" in the
 * practice timezone (Europe/London).
 *
 * The timezone matters at month boundaries: a payment charged at
 * 2025-06-30T23:30:00Z is 2025-07-01 00:30 BST locally, so it belongs to the
 * JULY period, not June. We format the date with an Intl formatter pinned to
 * Europe/London to get the correct local year and month.
 */
export function billingPeriodFromDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRACTICE_TZ,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;

  if (!year || !month) {
    throw new Error(`Could not derive billing period from date: ${date.toISOString()}`);
  }
  return `${year}-${month}`;
}

/**
 * The idempotency key for a recurring membership charge: one charge per plan
 * enrolment per billing period. This mirrors the DB-level
 * @@unique([patientPlanEnrolmentId, billingPeriod]) constraint on PlanPayment.
 */
export function chargeIdempotencyKey(
  patientPlanEnrolmentId: string,
  billingPeriod: string
): string {
  return `${patientPlanEnrolmentId}::${billingPeriod}`;
}

export type ExpectedCharge = {
  patientPlanEnrolmentId: string;
  billingPeriod: string;
  /** Amount in the smallest currency unit (pence) to avoid float drift. */
  amountPence: number;
};

export type LocalPayment = {
  patientPlanEnrolmentId: string | null;
  billingPeriod: string | null;
  gocardlessPaymentId: string | null;
  amountPence: number;
  status: string;
};

export type GoCardlessPayment = {
  id: string;
  amountPence: number;
  status: string;
  /** ISO date used to derive the billing period. */
  chargeDate: string;
  patientPlanEnrolmentId?: string | null;
};

export type ReconMismatch = {
  type: "MISSING" | "DUPLICATE" | "AMOUNT" | "STATUS" | "UNEXPECTED";
  patientPlanEnrolmentId: string | null;
  billingPeriod: string | null;
  gocardlessPaymentId?: string | null;
  detail: string;
};

/**
 * Compare ELIO's expected charges and locally-recorded payments against the
 * actual payments reported by GoCardless for a billing period, and return every
 * mismatch. This is the heart of the daily reconciliation job; keeping it pure
 * lets us test each mismatch class deterministically.
 *
 * Detected mismatch classes:
 *   - MISSING:    an expected charge with no corresponding GoCardless payment.
 *   - DUPLICATE:  more than one GoCardless payment for the same (enrolment, period).
 *   - AMOUNT:     amounts differ between expected/local and GoCardless.
 *   - STATUS:     local status differs from GoCardless status.
 *   - UNEXPECTED: a GoCardless payment with no matching expected charge.
 */
export function reconcile(params: {
  billingPeriod: string;
  expected: ExpectedCharge[];
  local: LocalPayment[];
  gocardless: GoCardlessPayment[];
}): ReconMismatch[] {
  const { billingPeriod, expected, local, gocardless } = params;
  const mismatches: ReconMismatch[] = [];

  // Index GoCardless payments for this period by plan enrolment.
  const gcByEnrolment = new Map<string, GoCardlessPayment[]>();
  for (const gc of gocardless) {
    const key = gc.patientPlanEnrolmentId ?? "__unknown__";
    const list = gcByEnrolment.get(key) ?? [];
    list.push(gc);
    gcByEnrolment.set(key, list);
  }

  const localByEnrolment = new Map<string, LocalPayment[]>();
  for (const p of local) {
    if (p.billingPeriod !== billingPeriod) continue;
    const key = p.patientPlanEnrolmentId ?? "__unknown__";
    const list = localByEnrolment.get(key) ?? [];
    list.push(p);
    localByEnrolment.set(key, list);
  }

  const expectedEnrolmentIds = new Set(expected.map((e) => e.patientPlanEnrolmentId));

  // 1. Expected-charge checks: missing, amount, status, duplicates.
  for (const exp of expected) {
    const gcList = gcByEnrolment.get(exp.patientPlanEnrolmentId) ?? [];

    if (gcList.length === 0) {
      mismatches.push({
        type: "MISSING",
        patientPlanEnrolmentId: exp.patientPlanEnrolmentId,
        billingPeriod,
        detail: `Expected a charge of ${exp.amountPence}p but GoCardless has none for ${billingPeriod}`,
      });
      continue;
    }

    if (gcList.length > 1) {
      mismatches.push({
        type: "DUPLICATE",
        patientPlanEnrolmentId: exp.patientPlanEnrolmentId,
        billingPeriod,
        detail: `GoCardless has ${gcList.length} payments for ${billingPeriod} (expected 1)`,
      });
    }

    for (const gc of gcList) {
      if (gc.amountPence !== exp.amountPence) {
        mismatches.push({
          type: "AMOUNT",
          patientPlanEnrolmentId: exp.patientPlanEnrolmentId,
          billingPeriod,
          gocardlessPaymentId: gc.id,
          detail: `Expected ${exp.amountPence}p, GoCardless charged ${gc.amountPence}p`,
        });
      }

      const localMatch = (localByEnrolment.get(exp.patientPlanEnrolmentId) ?? []).find(
        (l) => l.gocardlessPaymentId === gc.id
      );
      if (localMatch && localMatch.status !== gc.status) {
        mismatches.push({
          type: "STATUS",
          patientPlanEnrolmentId: exp.patientPlanEnrolmentId,
          billingPeriod,
          gocardlessPaymentId: gc.id,
          detail: `Local status "${localMatch.status}" != GoCardless "${gc.status}"`,
        });
      }
    }
  }

  // 2. Unexpected GoCardless payments (charged but no expected charge).
  for (const [enrolmentId, gcList] of gcByEnrolment) {
    if (enrolmentId === "__unknown__" || !expectedEnrolmentIds.has(enrolmentId)) {
      for (const gc of gcList) {
        mismatches.push({
          type: "UNEXPECTED",
          patientPlanEnrolmentId: enrolmentId === "__unknown__" ? null : enrolmentId,
          billingPeriod,
          gocardlessPaymentId: gc.id,
          detail: `GoCardless payment ${gc.id} has no matching expected charge for ${billingPeriod}`,
        });
      }
    }
  }

  return mismatches;
}

/**
 * Generic idempotent-create helper: attempt to create a row; if a concurrent
 * request already created it (a unique-constraint violation), fall back to
 * reading the existing row instead of throwing or creating a duplicate.
 *
 * This is the exact mechanism BUG-1's fix relies on for BOTH webhook-replay
 * safety (a WebhookEvent id primary key) and double-charge safety (PlanPayment's
 * unique (patientPlanEnrolmentId, billingPeriod)) — extracted here, pure and
 * DB-agnostic, so it can be unit tested directly rather than only exercised
 * through a live database. The webhook route (createPaymentFromGoCardless, and
 * the WebhookEvent replay guard) should use this helper for both cases; do not
 * reimplement the try/catch pattern inline elsewhere.
 */
export async function idempotentCreate<T>(params: {
  create: () => Promise<T>;
  findExisting: () => Promise<T | null>;
  isUniqueConstraintError: (error: unknown) => boolean;
}): Promise<T> {
  const { create, findExisting, isUniqueConstraintError } = params;
  try {
    return await create();
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // A concurrent request (retry, webhook replay, or a genuine race between
    // two requests) already created this row — use it instead of duplicating.
    const existing = await findExisting();
    if (!existing) throw error; // Not actually a race; a real failure.
    return existing;
  }
}
