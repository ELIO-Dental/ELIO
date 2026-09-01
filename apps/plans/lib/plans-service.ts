import { randomUUID } from "crypto";
import { scopedDb, prisma, Prisma } from "@elio/db";
import { writeAuditLog } from "@elio/auth";
import { sendSignupCompleteEmail, sendPatientInviteEmail } from "./email";
import {
  idempotentCreate,
  billingPeriodFromDate,
  chargeIdempotencyKey,
  chargeWindowForPeriod,
  reconcile,
  type ExpectedCharge,
  type LocalPayment,
  type GoCardlessPayment,
  type ReconMismatch,
} from "@elio/plans-engine";
import {
  createBillingRequest,
  createBillingRequestFlow,
  createSubscription,
  createPayment,
  getMandate,
  getCustomer,
  getPayment,
  getBillingRequest,
  listPaymentsByChargeDate,
  listCustomersByEmail,
  listMandatesForCustomer,
  cancelMandate,
  mapMandateStatus,
  mapPaymentStatus,
  verifyWebhookSignature,
  classifyGcMandatePollStatus,
} from "@elio/plans-engine";

// Deliberately duck-typed on `.code` rather than `instanceof
// Prisma.PrismaClientKnownRequestError`: confirmed live (real Playwright e2e
// run, real Postgres unique-constraint violation) that the instanceof check
// silently returned false for a genuine P2002 error, letting it propagate
// as an unhandled 500 instead of reaching idempotentCreate's findExisting()
// fallback — the exact double-charge case BUG-1 exists to prevent. Root
// cause: Next's dev-mode Turbopack bundles each API route as a separate
// module graph, so `Prisma.PrismaClientKnownRequestError` (imported here)
// and the error class actually thrown deep inside the generated Prisma
// client's own bundle instance are not the same constructor reference,
// even though both originate from "@elio/db" — a known class of pitfall
// with instanceof-based error detection in bundled/multi-instance
// environments. `.code` is a plain string property and survives this.
const isUniqueConstraintError = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === "P2002";

// ---------------------------------------------------------------------------
// Plans (models)
// ---------------------------------------------------------------------------

export async function listPlans(practiceId: string) {
  const db = scopedDb(practiceId);
  return db.planModel.findMany({
    where: { isCurrentVersion: true },
    include: { inclusions: true, discounts: true, eligibilityRules: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createPlan(
  practiceId: string,
  input: {
    name: string;
    monthlyPricePence: number;
    description?: string;
    publicDescription?: string;
    requiresAdultMembership?: boolean;
    dentistPayoutPerExamPence?: number;
  },
) {
  const db = scopedDb(practiceId);
  return db.planModel.create({ data: { practiceId, ...input } });
}

// ---------------------------------------------------------------------------
// Patient enrolment
// ---------------------------------------------------------------------------

/** Enrol an existing (core, shared) Patient onto a plan. Creates the PlanPatient
 * wrapper record on first enrolment (idempotent — one PlanPatient per Patient
 * per practice) and a new PENDING PatientPlanEnrolment. */
/** Signing request tokens are valid for this long — the patient must complete
 * the whole signup (T&Cs sign + DD mandate setup) within this window. */
const SIGNUP_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Enrols a patient and creates the real, usable signup invite in one step.
 * Found live (2026-08): this function previously created only the DB-only
 * enrolment rows and never a PlanSigningRequest — "Enrol a patient" in the
 * UI (and its /api/enrolments route, whose permission is literally named
 * "plans:invite-patients") silently produced no actual invite a patient
 * could use, so the real signup-to-first-charge flow (Testing 1.7's own
 * first checklist item) had no real entry point. Fixed by generating the
 * real token + returning the real /plans/signup/[token] URL here, same
 * shape as the test-only e2e route this mirrors. */
export async function enrolPatient(
  practiceId: string,
  input: { patientId: string; planId: string; parentPatientId?: string },
) {
  const db = scopedDb(practiceId);

  const plan = await db.planModel.findUnique({ where: { id: input.planId } });
  if (!plan) throw new Error("Plan not found");

  const isFreePlan = plan.monthlyPricePence === 0;

  if (isFreePlan) {
    const parentPatientId = input.parentPatientId?.trim();
    if (!parentPatientId) {
      throw new Error(
        "Please link this patient to a parent/guardian. Children on a free plan must be linked to an adult member.",
      );
    }
    const parent = await db.planPatient.findFirst({
      where: { id: parentPatientId, practiceId, status: "ACTIVE" },
      include: { patient: { select: { id: true } } },
    });
    if (!parent) throw new Error("Parent member not found or not active");
    if (parent.patient.id === input.patientId) {
      throw new Error("A patient cannot be their own parent");
    }

    let planPatient = await db.planPatient.findFirst({ where: { patientId: input.patientId } });
    if (!planPatient) {
      planPatient = await db.planPatient.create({
        data: {
          practiceId,
          patientId: input.patientId,
          status: "ACTIVE",
          planModelId: plan.id,
          parentPatientId,
        },
      });
    } else {
      planPatient = await db.planPatient.update({
        where: { id: planPatient.id },
        data: { status: "ACTIVE", planModelId: plan.id, parentPatientId },
      });
    }

    const enrolment = await db.patientPlanEnrolment.create({
      data: {
        practiceId,
        planPatientId: planPatient.id,
        planId: plan.id,
        status: "ACTIVE",
        startDate: new Date(),
      },
    });

    return { planPatient, enrolment, signupToken: null as string | null };
  }

  if (input.parentPatientId) {
    throw new Error("Parent linking is only required for free child plans");
  }

  const document = await db.planDocument.findFirst({
    where: { type: "TERMS_AND_CONDITIONS", isActive: true },
    orderBy: { effectiveDate: "desc" },
  });
  if (!document) {
    throw new Error("No active Terms & Conditions document — add one in Settings before inviting a patient");
  }

  let planPatient = await db.planPatient.findFirst({ where: { patientId: input.patientId } });
  if (!planPatient) {
    planPatient = await db.planPatient.create({
      data: { practiceId, patientId: input.patientId, status: "INVITED", planModelId: plan.id },
    });
  }

  const enrolment = await db.patientPlanEnrolment.create({
    data: { practiceId, planPatientId: planPatient.id, planId: plan.id, status: "PENDING" },
  });

  const signingRequest = await db.planSigningRequest.create({
    data: {
      practiceId,
      planPatientId: planPatient.id,
      documentId: document.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + SIGNUP_TOKEN_MAX_AGE_MS),
    },
  });

  return { planPatient, enrolment, signupToken: signingRequest.token };
}

// ---------------------------------------------------------------------------
// Public patient signup flow (UNAUTHENTICATED — token-scoped, not session-scoped).
// project-docs/MASTER_BUILD_GUIDE.md §1.7. The patient never has a NextAuth
// session, so every function here resolves its own tenant (practiceId) from
// the PlanSigningRequest.token itself (via the raw `prisma` client, same
// pattern as the webhook handlers above) rather than accepting a practiceId
// argument from a caller. Callers (the /api/public/signup/[token] routes)
// must NOT sit behind requirePermission() — that's the whole point.
// ---------------------------------------------------------------------------

const SIGNING_REQUEST_INCLUDE = {
  document: true,
  planPatient: {
    include: {
      patient: true,
      planModel: { include: { inclusions: true, discounts: true } },
      patientPlans: { orderBy: { createdAt: "desc" as const }, take: 1 },
      mandates: { where: { status: { in: ["PENDING", "ACTIVE"] as const } }, take: 1 },
    },
  },
} satisfies Prisma.PlanSigningRequestInclude;

/** Look up a signup invite by its public token. Returns null if the token
 * doesn't exist or has expired — callers must not leak which case it was
 * (an attacker probing tokens shouldn't learn "expired" vs "never existed"). */
export async function getSignupByToken(token: string) {
  const signingRequest = await prisma.planSigningRequest.findUnique({
    where: { token },
    include: SIGNING_REQUEST_INCLUDE,
  });
  if (!signingRequest) return null;
  if (signingRequest.expiresAt < new Date()) return { expired: true as const };
  return { expired: false as const, signingRequest };
}

/** Step 2 (T&Cs e-sign): record acceptance of the PlanDocument attached to
 * this signing request, and mark the signing request itself signed. Both
 * writes happen in the invite's own practice scope, resolved from the token
 * — idempotent-ish in that re-submitting just re-stamps signedAt/acceptedAt
 * (acceptable for an e-sign step; there is no financial side effect here). */
export async function acceptSigningRequestByToken(
  token: string,
  input: { signatureData: string; signatureIp?: string },
) {
  const signingRequest = await prisma.planSigningRequest.findUnique({
    where: { token },
    include: { planPatient: true },
  });
  if (!signingRequest) throw new Error("Signup link not found");
  if (signingRequest.expiresAt < new Date()) throw new Error("Signup link has expired");

  const db = scopedDb(signingRequest.practiceId);
  const [updatedRequest, acceptance] = await db.$transaction([
    db.planSigningRequest.update({
      where: { id: signingRequest.id },
      data: {
        signedAt: new Date(),
        signatureData: input.signatureData,
        signatureIp: input.signatureIp ?? null,
      },
    }),
    db.planDocumentAcceptance.create({
      data: {
        practiceId: signingRequest.practiceId,
        planPatientId: signingRequest.planPatientId,
        documentId: signingRequest.documentId,
        ipAddress: input.signatureIp ?? null,
      },
    }),
  ]);
  return { signingRequest: updatedRequest, acceptance };
}

/** Step 3 (GoCardless mandate): start a Billing Request Flow for the invited
 * patient, resolving practiceId/planPatientId from the token instead of a
 * staff session. Requires the T&Cs step (above) to have been completed first
 * — a patient can't skip straight to DD setup without having e-signed. */
export async function publicCreateMandateFlow(
  token: string,
  input: { redirectUri: string; exitUri: string },
) {
  const signingRequest = await prisma.planSigningRequest.findUnique({
    where: { token },
    include: { planPatient: { include: { patient: true } } },
  });
  if (!signingRequest) throw new Error("Signup link not found");
  if (signingRequest.expiresAt < new Date()) throw new Error("Signup link has expired");
  if (!signingRequest.signedAt) throw new Error("Terms and conditions must be accepted before setting up Direct Debit");

  const { patient } = signingRequest.planPatient;
  return createMandateFlow(signingRequest.practiceId, {
    planPatientId: signingRequest.planPatientId,
    redirectUri: input.redirectUri,
    exitUri: input.exitUri,
    email: patient.email ?? "",
    givenName: patient.firstName ?? "",
    familyName: patient.lastName ?? "",
  });
}

/** Flips PlanPatient + enrolment to ACTIVE and sends the signup email once. */
async function activatePlanMembershipAfterMandate(practiceId: string, planPatientId: string) {
  const db = scopedDb(practiceId);
  const activated = await db.planPatient.updateMany({
    where: { id: planPatientId, status: "INVITED" },
    data: { status: "ACTIVE" },
  });
  await db.patientPlanEnrolment.updateMany({
    where: { planPatientId, status: "PENDING" },
    data: { status: "ACTIVE", startDate: new Date() },
  });

  if (activated.count > 0) {
    const planPatient = await db.planPatient.findUnique({
      where: { id: planPatientId },
      include: { patient: true, planModel: true },
    });
    const practice = await db.practice.findUnique({ where: { id: practiceId } });
    if (planPatient?.patient.email && planPatient.planModel) {
      await sendSignupCompleteEmail({
        to: planPatient.patient.email,
        patientFirstName: planPatient.patient.firstName ?? "there",
        practiceName: practice?.name ?? "your practice",
        planName: planPatient.planModel.name,
      }).catch((e) => console.error("[plans] signup confirmation email failed:", e));
    }
  }

  return activated.count > 0;
}

/** Shared by the redirect path (publicRecordMandate) and the webhook path
 * (handleBillingRequestEvent) — records the mandate and flips the enrolment
 * from PENDING to ACTIVE, and the PlanPatient itself out of INVITED, now
 * that a mandate exists. Idempotent (recordMandate's own unique-constraint
 * guard), safe to call from both paths for the same mandate — including
 * both paths racing for the SAME mandate, which is exactly why the
 * confirmation email is gated on updateMany's own count rather than just
 * "this function ran": only the call that actually flips INVITED -> ACTIVE
 * (a real state transition, happens exactly once) sends it, not every
 * idempotent re-entry (a webhook retry, or the redirect firing after the
 * webhook already won). */
async function recordMandateAndActivate(
  practiceId: string,
  planPatientId: string,
  gocardlessMandateId: string,
) {
  const mandate = await recordMandate(practiceId, { planPatientId, gocardlessMandateId });
  await activatePlanMembershipAfterMandate(practiceId, planPatientId);
  return { mandate };
}

/** Step 3 callback: record the mandate GoCardless confirmed, resolving
 * practiceId from the token (same idempotent path as the staff-facing
 * PATCH /api/mandates — the webhook may also see/create this mandate first). */
export async function publicRecordMandate(token: string, gocardlessMandateId: string) {
  const signingRequest = await prisma.planSigningRequest.findUnique({ where: { token } });
  if (!signingRequest) throw new Error("Signup link not found");
  return recordMandateAndActivate(signingRequest.practiceId, signingRequest.planPatientId, gocardlessMandateId);
}

/** Step 3 redirect-back handler: GoCardless returns the browser to our
 * redirectUri with ?billing_request_id=... — resolve the mandate id off that
 * billing request and record it, the same idempotent path publicRecordMandate
 * uses. Handles the "browser redirect fired but the mandate isn't confirmed
 * yet" case by surfacing the billing request's actual status rather than
 * guessing (THEME_GUIDELINE §6.6 — no silent no-op on a real-money step). */
export async function publicResolveMandateFromBillingRequest(token: string, billingRequestId: string) {
  const billingRequest = await getBillingRequest(billingRequestId);
  const gocardlessMandateId: string | undefined = billingRequest?.links?.mandate_request_mandate;
  if (!gocardlessMandateId) {
    return { status: billingRequest?.status ?? "unknown", mandate: null };
  }
  const { mandate } = await publicRecordMandate(token, gocardlessMandateId);
  return { status: "confirmed" as const, mandate };
}

// ---------------------------------------------------------------------------
// GoCardless mandate setup (patient signup / DD setup flow)
// ---------------------------------------------------------------------------

/** Start a GoCardless Billing Request Flow for a plan patient's DD mandate. */
export async function createMandateFlow(
  practiceId: string,
  input: { planPatientId: string; redirectUri: string; exitUri: string; email: string; givenName: string; familyName: string },
) {
  const db = scopedDb(practiceId);
  const planPatient = await db.planPatient.findUnique({ where: { id: input.planPatientId } });
  if (!planPatient) throw new Error("Plan patient not found");

  const customer = await createBillingRequest({
    mandateRequest: { scheme: "bacs", currency: "GBP", metadata: { planPatientId: planPatient.id } },
    metadata: { planPatientId: planPatient.id },
  });
  const flow = await createBillingRequestFlow(customer.id, input.redirectUri, input.exitUri);
  return { billingRequest: customer, flow };
}

/** Record a mandate created via the signup flow once GoCardless confirms it
 * (called from the signup callback route, not the webhook — the webhook also
 * handles the case where GoCardless notifies us first, via handleMandateEvent
 * below, using the same idempotentCreate pattern). */
export async function recordMandate(
  practiceId: string,
  input: { planPatientId: string; gocardlessMandateId: string },
) {
  const db = scopedDb(practiceId);
  return idempotentCreate({
    create: () =>
      db.planMandate.create({
        data: { practiceId, planPatientId: input.planPatientId, gocardlessMandateId: input.gocardlessMandateId, status: "PENDING" },
      }),
    findExisting: () => db.planMandate.findUnique({ where: { gocardlessMandateId: input.gocardlessMandateId } }),
    isUniqueConstraintError,
  });
}

// ---------------------------------------------------------------------------
// Billing (BUG-1 idempotent charge creation)
// ---------------------------------------------------------------------------

/**
 * Create the recurring membership charge for a plan enrolment/billing period,
 * idempotently. This is the core of BUG-1's fix: relies on PlanPayment's
 * @@unique([patientPlanEnrolmentId, billingPeriod]) DB constraint via
 * idempotentCreate() so a retried/duplicate call collapses onto one row
 * instead of double-charging the patient.
 */
/**
 * F.5 Final QA (2026-08-29) — REAL GAP FOUND AND FIXED: this function
 * previously only ever wrote a local PlanPayment row with
 * gocardlessPaymentId left null — it never actually called GoCardless's
 * createPayment() API at all, meaning even once something DID call this
 * function on a schedule (see apps/plans/app/api/cron/create-charges'
 * closeout comment for the full story), no real money would ever move; the
 * local row would sit as a permanent PENDING/reconciliation-mismatch ghost.
 * Fixed to genuinely create the GoCardless payment FIRST (the real charge),
 * then record it locally using the real, GoCardless-confirmed payment id —
 * idempotentCreate()'s own race-safety (see its doc comment) still applies
 * to the local bookkeeping half of this, exactly as before.
 */
export async function createCharge(
  practiceId: string,
  input: {
    planPatientId: string;
    patientPlanEnrolmentId: string;
    mandateId?: string;
    gocardlessMandateId: string;
    amountPence: number;
    chargeDate: Date;
    planName?: string;
  },
) {
  const db = scopedDb(practiceId);
  const billingPeriod = billingPeriodFromDate(input.chargeDate);

  // F.5 Final QA (2026-08-29) — a second real bug found while fixing the
  // first one above: calling createPayment() unconditionally BEFORE the
  // idempotency check would create a genuine SECOND real GoCardless charge
  // on any retry/duplicate call for the same enrolment/period, even though
  // the local DB row was correctly deduped — exactly the double-charge BUG-1
  // exists to prevent, just moved to the GoCardless side instead of the
  // local DB side. Checking for an existing local row FIRST (before ever
  // calling GoCardless) closes that: a genuine retry short-circuits here and
  // never reaches the real charge call at all.
  const existing = await db.planPayment.findUnique({
    where: { patientPlanEnrolmentId_billingPeriod: { patientPlanEnrolmentId: input.patientPlanEnrolmentId, billingPeriod } },
  });
  if (existing) return existing;

  // Real GoCardless charge attempt — this is the actual money-moving call.
  // metadata.patientPlanEnrolmentId lets the webhook-driven idempotency path
  // (processWebhookEvent/handlePaymentEvent) and reconciliation both
  // correlate this GoCardless payment back to the right local row, matching
  // the same metadata-correlation pattern already used for billing requests.
  const gcPayment = await createPayment(
    input.gocardlessMandateId,
    input.amountPence,
    "GBP",
    input.planName ? `${input.planName} membership` : "Membership plan payment",
    input.chargeDate.toISOString().slice(0, 10),
    { patientPlanEnrolmentId: input.patientPlanEnrolmentId, billingPeriod },
  );
  const gocardlessPaymentId = (gcPayment as { id?: string })?.id;

  // idempotentCreate() still guards the narrower race window between the
  // existence check above and this create (two concurrent calls both
  // passing the check before either writes) — it can't do anything about a
  // genuine GoCardless double-charge in that same narrow window, which is a
  // real, inherent limit of "check locally, then call an external API" with
  // no true distributed lock; BUG-1's own acceptance criteria (packages/
  // plans-engine's real tests) covers the DB-side race, and this is the
  // same trade-off the pre-existing billing-request-creation path already
  // makes elsewhere in this file.
  return idempotentCreate({
    create: () =>
      db.planPayment.create({
        data: {
          practiceId,
          planPatientId: input.planPatientId,
          patientPlanEnrolmentId: input.patientPlanEnrolmentId,
          mandateId: input.mandateId ?? null,
          billingPeriod,
          gocardlessPaymentId: gocardlessPaymentId ?? null,
          amountPence: input.amountPence,
          status: "PENDING",
        },
      }),
    findExisting: () =>
      db.planPayment.findUnique({
        where: {
          patientPlanEnrolmentId_billingPeriod: {
            patientPlanEnrolmentId: input.patientPlanEnrolmentId,
            billingPeriod,
          },
        },
      }),
    isUniqueConstraintError,
  });
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export async function runReconciliation(practiceId: string, period: string): Promise<{
  period: string;
  chargeWindow: { from: string; to: string };
  counts: { expected: number; localPayments: number; gocardlessPayments: number; mismatches: number };
  mismatches: ReconMismatch[];
}> {
  const db = scopedDb(practiceId);
  const { from, to } = chargeWindowForPeriod(period);

  const activeEnrolments = await db.patientPlanEnrolment.findMany({
    where: { status: "ACTIVE" },
    include: {
      plan: true,
      planPatient: { include: { mandates: { where: { status: "ACTIVE" }, take: 1 } } },
    },
  });

  const expected: ExpectedCharge[] = activeEnrolments
    .filter((e) => e.planPatient.mandates.length > 0 && e.plan.monthlyPricePence > 0)
    .map((e) => ({ patientPlanEnrolmentId: e.id, billingPeriod: period, amountPence: e.plan.monthlyPricePence }));

  const localRows = await db.planPayment.findMany({
    where: { billingPeriod: period },
    select: { patientPlanEnrolmentId: true, billingPeriod: true, gocardlessPaymentId: true, amountPence: true, status: true },
  });
  const local: LocalPayment[] = localRows.map((p) => ({
    patientPlanEnrolmentId: p.patientPlanEnrolmentId,
    billingPeriod: p.billingPeriod,
    gocardlessPaymentId: p.gocardlessPaymentId,
    amountPence: p.amountPence,
    status: p.status,
  }));

  const enrolmentByGcId = new Map<string, string | null>();
  for (const p of localRows) {
    if (p.gocardlessPaymentId) enrolmentByGcId.set(p.gocardlessPaymentId, p.patientPlanEnrolmentId);
  }

  const gcPayments = await listPaymentsByChargeDate(from, to);
  const gocardless: GoCardlessPayment[] = gcPayments.map((gc: { id: string; amount: number | string; status: string; charge_date: string }) => ({
    id: gc.id,
    amountPence: typeof gc.amount === "number" ? gc.amount : Number(gc.amount) || 0,
    // GoCardless reports lowercase_snake_case statuses ("confirmed"); local
    // PlanPayment rows use the PlanPaymentStatus enum's UPPER_SNAKE_CASE
    // ("CONFIRMED"). Without normalizing through the same mapPaymentStatus()
    // handlePaymentEvent() uses, reconcile()'s STATUS check would raw-string-
    // compare the two casings and flag every genuinely-matching payment as a
    // mismatch — confirmed live: a real payment/mock-GoCardless pair with
    // identical amounts and truly matching status still produced a false
    // STATUS mismatch before this fix.
    status: mapPaymentStatus(gc.status),
    chargeDate: gc.charge_date,
    patientPlanEnrolmentId: enrolmentByGcId.get(gc.id) ?? null,
  }));

  const mismatches = reconcile({ billingPeriod: period, expected, local, gocardless });

  return {
    period,
    chargeWindow: { from, to },
    counts: {
      expected: expected.length,
      localPayments: local.length,
      gocardlessPayments: gocardless.length,
      mismatches: mismatches.length,
    },
    mismatches,
  };
}

// ---------------------------------------------------------------------------
// Redeems (benefit redemption approval workflow)
// ---------------------------------------------------------------------------

export async function listRedeems(practiceId: string, status?: string) {
  const db = scopedDb(practiceId);
  return db.planRedeem.findMany({
    where: { ...(status ? { status: status as "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PARTIALLY_EARNED" } : {}) },
    include: { planPatient: { include: { patient: true } }, redeemRule: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/** Approve a PENDING_APPROVAL redeem. Writes an AuditLog row
 * (PERMISSIONS_MATRIX.md §6 — every approval decision is audited). */
export async function approveRedeem(practiceId: string, actor: { actorUserId: string; impersonatedUserId?: string }, redeemId: string) {
  const db = scopedDb(practiceId);
  const redeem = await db.planRedeem.findUnique({ where: { id: redeemId } });
  if (!redeem) throw new Error("Redeem not found");
  if (redeem.status !== "PENDING_APPROVAL") throw new Error("Redeem is not pending approval");

  const updated = await db.planRedeem.update({
    where: { id: redeemId },
    // approvedById attributed to the REAL actor (the Super Admin during
    // impersonation, Step 2.3) — same identity as the AuditLog row below.
    data: { status: "APPROVED", approvedById: actor.actorUserId, approvedAt: new Date() },
  });
  await writeAuditLog({
    ...actor,
    practiceId,
    action: "plans.redeem.approve",
    targetType: "PlanRedeem",
    targetId: redeemId,
  });
  return updated;
}

/** Reject a PENDING_APPROVAL redeem, recording a reason. Writes an AuditLog row. */
export async function rejectRedeem(
  practiceId: string,
  actor: { actorUserId: string; impersonatedUserId?: string },
  redeemId: string,
  rejectionReason?: string,
) {
  const db = scopedDb(practiceId);
  const redeem = await db.planRedeem.findUnique({ where: { id: redeemId } });
  if (!redeem) throw new Error("Redeem not found");
  if (redeem.status !== "PENDING_APPROVAL") throw new Error("Redeem is not pending approval");

  const updated = await db.planRedeem.update({
    where: { id: redeemId },
    data: { status: "REJECTED", approvedById: actor.actorUserId, approvedAt: new Date(), rejectionReason: rejectionReason ?? null },
  });
  await writeAuditLog({
    ...actor,
    practiceId,
    action: "plans.redeem.reject",
    targetType: "PlanRedeem",
    targetId: redeemId,
    metadata: rejectionReason ? { rejectionReason } : undefined,
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Settings (redeem approval policy — PERMISSIONS_MATRIX.md §4 "Edit practice
// settings" -> plans:edit-settings)
// ---------------------------------------------------------------------------

/** List every redeem rule for the practice, with its parent plan name, so
 * Settings can show/edit each rule's `requiresApproval` flag in one place. */
export async function listRedeemRules(practiceId: string) {
  const db = scopedDb(practiceId);
  return db.planRedeemRule.findMany({
    include: { plan: { select: { name: true } } },
    orderBy: [{ planId: "asc" }, { sortOrder: "asc" }],
  });
}

/** Toggle a redeem rule's approval requirement. Writes an AuditLog row —
 * this changes who can redeem benefits without staff sign-off. */
export async function updateRedeemRuleApproval(
  practiceId: string,
  actor: { actorUserId: string; impersonatedUserId?: string },
  redeemRuleId: string,
  requiresApproval: boolean,
) {
  const db = scopedDb(practiceId);
  const updated = await db.planRedeemRule.update({
    where: { id: redeemRuleId },
    data: { requiresApproval },
  });
  await writeAuditLog({
    ...actor,
    practiceId,
    action: "plans.settings.redeem_rule_approval.updated",
    targetType: "PlanRedeemRule",
    targetId: redeemRuleId,
    metadata: { requiresApproval },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// GoCardless webhook processing
// ---------------------------------------------------------------------------

export { verifyWebhookSignature, chargeIdempotencyKey };

export interface GoCardlessEvent {
  id: string;
  resource_type: string;
  action: string;
  links: Record<string, string>;
  details?: Record<string, unknown>;
}

/**
 * Process one webhook event, idempotently. Uses the raw (unscoped) `prisma`
 * client for the event-replay guard (PlanWebhookEvent has no practiceId — the
 * event's tenant isn't known until we resolve the mandate/payment it
 * references) and for resolving that tenant, then re-derives a scopedDb() for
 * every tenant-owned write so BUG-1's fix and tenant isolation both apply.
 *
 * Mirrors ElioPlans' real production webhook handler
 * (src/app/api/webhooks/gocardless/route.ts) functionally: same event
 * routing (mandates/payments/subscriptions), same idempotent-create guard at
 * both the event level (PlanWebhookEvent id) and the payment level
 * (PlanPayment's unique constraint).
 */
export async function processWebhookEvent(event: GoCardlessEvent): Promise<{ duplicate: boolean }> {
  if (event.id) {
    let wasDuplicate = false;
    await idempotentCreate({
      create: () =>
        prisma.planWebhookEvent.create({
          data: { id: event.id, resourceType: event.resource_type, action: event.action },
        }),
      findExisting: async () => {
        wasDuplicate = true;
        return prisma.planWebhookEvent.findUnique({ where: { id: event.id } });
      },
      isUniqueConstraintError,
    });
    if (wasDuplicate) {
      console.log(`[GoCardless Webhook] Duplicate event ${event.id} ignored`);
      return { duplicate: true };
    }
  }

  switch (event.resource_type) {
    case "mandates":
      await handleMandateEvent(event.action, event.links.mandate ?? "");
      break;
    case "payments":
      await handlePaymentEvent(event.action, event.links.payment ?? "", event.details);
      break;
    case "subscriptions":
      await handleSubscriptionEvent(event.action, event.links.subscription ?? "");
      break;
    case "billing_requests":
      await handleBillingRequestEvent(event.action, event.links.billing_request ?? "");
      break;
    default:
      console.log(`[GoCardless Webhook] Unhandled resource type: ${event.resource_type}`);
  }

  return { duplicate: false };
}

/** The AUTHORITATIVE mandate-creation path for the public signup flow — per
 * GoCardless's own guidance ("Don't rely on the redirect back to your site
 * to confirm the outcome. Always use webhooks."), NOT the redirect-based
 * publicResolveMandateFromBillingRequest, which is real UX-acceleration
 * (skips the wait for a webhook round-trip when it works) but was found live
 * (2026-08-28) to be unreliable on its own — GoCardless's actual redirect
 * query params are `outcome`/`id` (the Billing Request FLOW id), not
 * `billing_request_id`, so a client relying solely on that redirect can
 * silently never record the mandate even though GoCardless confirms it.
 *
 * On a `fulfilled` billing_request, re-fetches it (GoCardless doesn't
 * include full metadata/links in the webhook payload itself) to read the
 * `planPatientId` we stamped into `metadata` at creation (createMandateFlow)
 * and the confirmed mandate id (`links.mandate_request_mandate`) — the same
 * correlation key a raw redirect would have needed anyway, just sourced
 * from GoCardless's own record instead of a fragile round-trip through the
 * patient's browser. */
async function handleBillingRequestEvent(action: string, billingRequestId: string) {
  if (action !== "fulfilled" || !billingRequestId) return;

  const billingRequest = await getBillingRequest(billingRequestId);
  const planPatientId = billingRequest?.metadata?.planPatientId as string | undefined;
  const gocardlessMandateId = billingRequest?.links?.mandate_request_mandate as string | undefined;
  if (!planPatientId || !gocardlessMandateId) {
    console.log(`[GoCardless Webhook] billing_request ${billingRequestId} fulfilled but missing planPatientId/mandate link, skipping`);
    return;
  }

  const planPatient = await prisma.planPatient.findUnique({ where: { id: planPatientId } });
  if (!planPatient) {
    console.log(`[GoCardless Webhook] billing_request ${billingRequestId}: PlanPatient ${planPatientId} not found, skipping`);
    return;
  }

  await recordMandateAndActivate(planPatient.practiceId, planPatientId, gocardlessMandateId);
}

async function handleMandateEvent(action: string, gocardlessMandateId: string) {
  const mandate = await prisma.planMandate.findUnique({
    where: { gocardlessMandateId },
    include: { planPatient: true },
  });
  if (!mandate) {
    console.log(`[GoCardless Webhook] Mandate not in DB: ${gocardlessMandateId} — no local match, skipping`);
    return;
  }

  const newStatus = mapMandateStatus(action === "active" ? "active" : action) as
    | "PENDING"
    | "ACTIVE"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED";

  const db = scopedDb(mandate.practiceId);
  await db.planMandate.update({ where: { id: mandate.id }, data: { status: newStatus } });

  if (action === "active") {
    await activatePlanMembershipAfterMandate(mandate.practiceId, mandate.planPatientId);
    return;
  }

  const newPatientStatus =
    action === "failed"
      ? "PAUSED"
      : action === "cancelled"
        ? "CANCELLED"
        : mandate.planPatient.status;

  await db.planPatient.update({ where: { id: mandate.planPatientId }, data: { status: newPatientStatus } });
}

async function handlePaymentEvent(action: string, gocardlessPaymentId: string, details?: Record<string, unknown>) {
  let payment = await prisma.planPayment.findUnique({ where: { gocardlessPaymentId } });

  // GoCardless's own subscription schedule can create the recurring monthly
  // charge, so the FIRST webhook we see for a payment may be the moment we
  // learn of it — create the local row now if so. Idempotent via
  // gocardlessPaymentId's unique constraint AND
  // (patientPlanEnrolmentId, billingPeriod)'s unique constraint (BUG-1).
  if (!payment) {
    payment = await createPaymentFromGoCardless(gocardlessPaymentId, details);
    if (!payment) {
      console.log(`[GoCardless Webhook] Could not attribute payment ${gocardlessPaymentId} to a mandate; skipping`);
      return;
    }
  }

  const statusMap: Record<string, string> = {
    created: "PENDING",
    submitted: "PENDING",
    confirmed: "CONFIRMED",
    paid_out: "PAID_OUT",
    failed: "FAILED",
    cancelled: "CANCELLED",
    charged_back: "CHARGED_BACK",
  };
  const newStatus = (statusMap[action] ?? payment.status) as
    | "PENDING"
    | "CONFIRMED"
    | "PAID_OUT"
    | "FAILED"
    | "CANCELLED"
    | "CHARGED_BACK";

  const db = scopedDb(payment.practiceId);
  await db.planPayment.update({ where: { id: payment.id }, data: { status: newStatus } });

  if (action === "failed" && payment.planPatientId) {
    await db.planPatient.update({ where: { id: payment.planPatientId }, data: { status: "PAUSED" } });
  }
}

/**
 * Create the local PlanPayment row for a GoCardless payment we haven't seen
 * before. Returns the created (or concurrently-created, via idempotentCreate)
 * row, or null if it can't be attributed to a local mandate.
 *
 * DEV/TEST MOCK PATH: when GOCARDLESS_ALLOW_MOCK=true (apps/plans/.env.local,
 * local dev only — must be false/unset in production), a webhook-replay test
 * cannot call the real GoCardless API (no live payment exists to fetch). In
 * that mode only, if fetching the payment from the real API fails, fall back
 * to reading amountPence/chargeDate straight off the webhook event's own
 * `details` (a real GoCardless payment.created event never carries these,
 * so this path is never reachable in production traffic).
 */
async function createPaymentFromGoCardless(gocardlessPaymentId: string, details?: Record<string, unknown>) {
  const allowMock = process.env.GOCARDLESS_ALLOW_MOCK === "true";

  let gcMandateId: string | undefined;
  let amountPence: number | undefined;
  let chargeDate: Date | undefined;
  let status = "pending_submission";

  try {
    const gcPayment = await getPayment(gocardlessPaymentId);
    gcMandateId = gcPayment?.links?.mandate;
    amountPence = typeof gcPayment?.amount === "number" ? gcPayment.amount : Number(gcPayment?.amount) || 0;
    chargeDate = gcPayment?.charge_date ? new Date(gcPayment.charge_date) : new Date();
    status = gcPayment?.status ?? status;
  } catch (err) {
    if (!allowMock || !details?.mockMandateId) throw err;
    gcMandateId = String(details.mockMandateId);
    amountPence = Number(details.mockAmountPence ?? 0);
    chargeDate = details.mockChargeDate ? new Date(String(details.mockChargeDate)) : new Date();
    status = String(details.mockStatus ?? status);
  }

  if (!gcMandateId) return null;

  const mandate = await prisma.planMandate.findUnique({
    where: { gocardlessMandateId: gcMandateId },
    include: {
      planPatient: {
        include: { patientPlans: { where: { status: { in: ["ACTIVE", "PENDING"] } }, orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!mandate) {
    console.log(`[GoCardless Webhook] No local mandate for ${gcMandateId}; cannot attribute payment ${gocardlessPaymentId}`);
    return null;
  }

  const enrolment = mandate.planPatient.patientPlans[0] ?? null;
  const billingPeriod = enrolment ? billingPeriodFromDate(chargeDate!) : null;
  const db = scopedDb(mandate.practiceId);

  return idempotentCreate({
    create: () =>
      db.planPayment.create({
        data: {
          practiceId: mandate.practiceId,
          planPatientId: mandate.planPatientId,
          patientPlanEnrolmentId: enrolment?.id ?? null,
          mandateId: mandate.id,
          billingPeriod,
          gocardlessPaymentId,
          amountPence: amountPence ?? 0,
          status: mapPaymentStatus(status) as "PENDING" | "CONFIRMED" | "PAID_OUT" | "FAILED" | "CANCELLED" | "CHARGED_BACK",
        },
      }),
    findExisting: () => {
      console.log(`[GoCardless Webhook] Payment ${gocardlessPaymentId} created concurrently; using existing row`);
      return db.planPayment.findUnique({ where: { gocardlessPaymentId } });
    },
    isUniqueConstraintError,
  });
}

async function handleSubscriptionEvent(action: string, gocardlessSubscriptionId: string) {
  console.log(`[GoCardless Webhook] Subscription ${action}: ${gocardlessSubscriptionId}`);
  if (action !== "cancelled" && action !== "finished") return;
  // Subscriptions aren't tracked by id locally today (metadata carries the
  // linkage in the real ElioPlans flow) — logged for now; ending a
  // subscription's billing is reflected via the mandate's `cancelled` event
  // instead, which IS tracked locally (handleMandateEvent above).
}

// ---------------------------------------------------------------------------
// Cron: signup subscription helper (used by the mandate-active auto-link path
// and by the /api/cron/reconcile-payments route's own callers where needed).
// ---------------------------------------------------------------------------

export async function ensureSubscription(
  gocardlessMandateId: string,
  amountPence: number,
  planName: string,
  dayOfMonth = 1,
) {
  return createSubscription(gocardlessMandateId, amountPence, "GBP", planName, dayOfMonth);
}

export type GcMandateSyncResult = {
  checked: number;
  activated: number;
  failed: number;
  cancelled: number;
  unchanged: number;
  errors: string[];
};

/**
 * Poll GoCardless for PENDING mandates and reconcile local state (P1.8).
 * Webhook-first architecture — this is the safety net when events are missed.
 */
export async function syncPendingMandatesForPractice(practiceId: string): Promise<GcMandateSyncResult> {
  const db = scopedDb(practiceId);
  const pendingMandates = await db.planMandate.findMany({
    where: { status: "PENDING" },
    select: { id: true, planPatientId: true, gocardlessMandateId: true },
  });

  const results: GcMandateSyncResult = {
    checked: pendingMandates.length,
    activated: 0,
    failed: 0,
    cancelled: 0,
    unchanged: 0,
    errors: [],
  };

  for (const mandate of pendingMandates) {
    try {
      const gcMandate = await getMandate(mandate.gocardlessMandateId);
      const outcome = classifyGcMandatePollStatus(gcMandate?.status as string | undefined);

      if (outcome === "unchanged") {
        results.unchanged++;
        continue;
      }

      if (outcome === "activate") {
        await db.planMandate.update({ where: { id: mandate.id }, data: { status: "ACTIVE" } });
        await activatePlanMembershipAfterMandate(practiceId, mandate.planPatientId);
        results.activated++;
        continue;
      }

      if (outcome === "fail") {
        await db.planMandate.update({ where: { id: mandate.id }, data: { status: "FAILED" } });
        await db.planPatient.update({ where: { id: mandate.planPatientId }, data: { status: "PAUSED" } });
        results.failed++;
        continue;
      }

      const gcStatus = gcMandate?.status as string;
      await db.planMandate.update({
        where: { id: mandate.id },
        data: { status: gcStatus === "cancelled" ? "CANCELLED" : "EXPIRED" },
      });
      if (gcStatus === "cancelled") {
        await db.planPatient.update({ where: { id: mandate.planPatientId }, data: { status: "CANCELLED" } });
      }
      results.cancelled++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.errors.push(`Mandate ${mandate.gocardlessMandateId}: ${message}`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Patient detail (P2.3 / P2.3a)
// ---------------------------------------------------------------------------

const PLAN_PATIENT_DETAIL_INCLUDE = {
  patient: true,
  planModel: { select: { id: true, name: true, monthlyPricePence: true, requiresAdultMembership: true } },
  parentPatient: {
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
  },
  childPatients: {
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
  },
  mandates: { orderBy: { createdAt: "desc" as const } },
  payments: { orderBy: { createdAt: "desc" as const }, take: 100 },
  redeems: { orderBy: { createdAt: "desc" as const }, take: 50 },
  patientPlans: { orderBy: { createdAt: "desc" as const }, include: { plan: { select: { id: true, name: true } } } },
  signingRequests: {
    orderBy: { createdAt: "desc" as const },
    include: { document: { select: { id: true, title: true, type: true, version: true } } },
    take: 20,
  },
  documentAcceptances: {
    orderBy: { acceptedAt: "desc" as const },
    include: { document: { select: { id: true, title: true, type: true, version: true } } },
    take: 20,
  },
} as const;

export async function getPlanPatientDetail(practiceId: string, planPatientId: string) {
  const db = scopedDb(practiceId);
  return db.planPatient.findFirst({
    where: { id: planPatientId },
    include: PLAN_PATIENT_DETAIL_INCLUDE,
  });
}

export async function pausePlanPatient(practiceId: string, planPatientId: string, reason?: string) {
  const db = scopedDb(practiceId);
  const existing = await db.planPatient.findUnique({ where: { id: planPatientId } });
  if (!existing) throw new Error("Plan patient not found");
  if (existing.status === "CANCELLED") throw new Error("Cannot pause a cancelled membership");

  const planPatient = await db.planPatient.update({
    where: { id: planPatientId },
    data: { status: "PAUSED" },
  });
  await db.patientPlanEnrolment.updateMany({
    where: { planPatientId, status: "ACTIVE" },
    data: { status: "PAUSED" },
  });
  return { planPatient, reason: reason ?? null };
}

export async function resumePlanPatient(practiceId: string, planPatientId: string) {
  const db = scopedDb(practiceId);
  const existing = await db.planPatient.findUnique({ where: { id: planPatientId } });
  if (!existing) throw new Error("Plan patient not found");
  if (existing.status !== "PAUSED") throw new Error("Only paused memberships can be resumed");

  const planPatient = await db.planPatient.update({
    where: { id: planPatientId },
    data: { status: "ACTIVE" },
  });
  await db.patientPlanEnrolment.updateMany({
    where: { planPatientId, status: "PAUSED" },
    data: { status: "ACTIVE" },
  });
  return planPatient;
}

export async function cancelPlanPatient(
  practiceId: string,
  planPatientId: string,
  options?: { cancelDirectDebit?: boolean; reason?: string },
) {
  const db = scopedDb(practiceId);
  const existing = await db.planPatient.findUnique({ where: { id: planPatientId } });
  if (!existing) throw new Error("Plan patient not found");
  if (existing.status === "CANCELLED") throw new Error("Membership is already cancelled");

  const gcErrors: string[] = [];
  if (options?.cancelDirectDebit) {
    const mandates = await db.planMandate.findMany({
      where: { planPatientId, status: { in: ["ACTIVE", "PENDING"] } },
    });
    for (const mandate of mandates) {
      try {
        await cancelMandate(mandate.gocardlessMandateId);
        await db.planMandate.update({ where: { id: mandate.id }, data: { status: "CANCELLED" } });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        gcErrors.push(`Mandate ${mandate.gocardlessMandateId}: ${message}`);
      }
    }
  }

  const planPatient = await db.planPatient.update({
    where: { id: planPatientId },
    data: { status: "CANCELLED" },
  });
  await db.patientPlanEnrolment.updateMany({
    where: { planPatientId, status: { in: ["PENDING", "ACTIVE", "PAUSED"] } },
    data: { status: "CANCELLED", endDate: new Date() },
  });
  return { planPatient, gcErrors, reason: options?.reason ?? null };
}

/** Create a fresh signup invite link for an existing plan patient (P2.3a). */
export async function resendPatientSignupInvite(
  practiceId: string,
  planPatientId: string,
  options?: { sendEmail?: boolean },
) {
  const db = scopedDb(practiceId);
  const planPatient = await db.planPatient.findUnique({
    where: { id: planPatientId },
    include: { planModel: true, patient: true, mandates: true },
  });
  if (!planPatient) throw new Error("Plan patient not found");

  const hasActiveMandate = planPatient.mandates.some((m) => m.status === "ACTIVE");
  if (planPatient.status === "ACTIVE" && hasActiveMandate) {
    throw new Error("Patient is already active with a Direct Debit mandate");
  }

  const document = await db.planDocument.findFirst({
    where: { type: "TERMS_AND_CONDITIONS", isActive: true },
    orderBy: { effectiveDate: "desc" },
  });
  if (!document) {
    throw new Error("No active Terms & Conditions document — add one in Settings before inviting a patient");
  }

  const signingRequest = await db.planSigningRequest.create({
    data: {
      practiceId,
      planPatientId,
      documentId: document.id,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + SIGNUP_TOKEN_MAX_AGE_MS),
    },
  });

  const signupUrl = `/plans/signup/${signingRequest.token}`;
  if (options?.sendEmail && planPatient.patient.email) {
    const practice = await prisma.practice.findUnique({ where: { id: practiceId }, select: { name: true } });
    await sendPatientInviteEmail({
      to: planPatient.patient.email,
      patientFirstName: planPatient.patient.firstName ?? "there",
      practiceName: practice?.name ?? "your practice",
      planName: planPatient.planModel?.name ?? "membership plan",
      signupUrl,
    });
  }

  return { signupUrl, token: signingRequest.token, emailed: Boolean(options?.sendEmail && planPatient.patient.email) };
}

/** Search GoCardless by patient email and link any active mandates (legacy check-gc). */
export async function discoverAndLinkGoCardlessMandate(practiceId: string, planPatientId: string) {
  const db = scopedDb(practiceId);
  const planPatient = await db.planPatient.findUnique({
    where: { id: planPatientId },
    include: { patient: true, planModel: true },
  });
  if (!planPatient) throw new Error("Plan patient not found");

  const email = planPatient.patient.email?.trim().toLowerCase();
  if (!email) throw new Error("Patient has no email — cannot search GoCardless");

  const customers = await listCustomersByEmail(email);
  let linked = 0;
  const errors: string[] = [];

  for (const customer of customers) {
    const gcMandates = await listMandatesForCustomer(String(customer.id));
    for (const gcMandate of gcMandates) {
      const status = String(gcMandate.status ?? "");
      if (!["active", "pending_submission", "submitted"].includes(status)) continue;

      const gocardlessMandateId = String(gcMandate.id);
      const existing = await db.planMandate.findUnique({ where: { gocardlessMandateId } });
      if (existing && existing.planPatientId !== planPatientId) {
        errors.push(`Mandate ${gocardlessMandateId} is already linked to another patient`);
        continue;
      }

      await recordMandate(practiceId, { planPatientId, gocardlessMandateId });
      linked++;

      if (status === "active") {
        await activatePlanMembershipAfterMandate(practiceId, planPatientId);
        if (planPatient.planModel && planPatient.planModel.monthlyPricePence > 0) {
          try {
            await ensureSubscription(
              gocardlessMandateId,
              planPatient.planModel.monthlyPricePence,
              planPatient.planModel.name,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            errors.push(`Subscription for ${gocardlessMandateId}: ${message}`);
          }
        }
      }
    }
  }

  return { linked, customersSearched: customers.length, errors };
}

/** Link a GoCardless mandate ID manually (legacy link-mandate). */
export async function linkPlanPatientMandate(practiceId: string, planPatientId: string, gocardlessMandateId: string) {
  const db = scopedDb(practiceId);
  const planPatient = await db.planPatient.findUnique({
    where: { id: planPatientId },
    include: { planModel: true },
  });
  if (!planPatient) throw new Error("Plan patient not found");

  const existing = await db.planMandate.findUnique({ where: { gocardlessMandateId } });
  if (existing && existing.planPatientId !== planPatientId) {
    throw new Error("This mandate is already linked to another patient");
  }

  const mandate = await recordMandate(practiceId, { planPatientId, gocardlessMandateId });
  const gcMandate = await getMandate(gocardlessMandateId);
  if (gcMandate?.status === "active") {
    await activatePlanMembershipAfterMandate(practiceId, planPatientId);
    if (planPatient.planModel && planPatient.planModel.monthlyPricePence > 0) {
      await ensureSubscription(gocardlessMandateId, planPatient.planModel.monthlyPricePence, planPatient.planModel.name);
    }
  }
  return mandate;
}

/** Poll GoCardless for mandate status on one plan patient (P2.3a). */
export async function checkPlanPatientGoCardless(practiceId: string, planPatientId: string) {
  const db = scopedDb(practiceId);
  let mandates = await db.planMandate.findMany({
    where: { planPatientId },
    orderBy: { createdAt: "desc" },
  });

  let discovery: Awaited<ReturnType<typeof discoverAndLinkGoCardlessMandate>> | null = null;
  if (mandates.length === 0) {
    discovery = await discoverAndLinkGoCardlessMandate(practiceId, planPatientId);
    mandates = await db.planMandate.findMany({
      where: { planPatientId },
      orderBy: { createdAt: "desc" },
    });
  }

  const results: Array<{ mandateId: string; gocardlessMandateId: string; previousStatus: string; newStatus: string; action: string }> = [];

  for (const mandate of mandates) {
    const gcMandate = await getMandate(mandate.gocardlessMandateId);
    const outcome = classifyGcMandatePollStatus(gcMandate?.status as string | undefined);
    let newStatus = mandate.status;
    let action = "unchanged";

    if (outcome === "activate") {
      await db.planMandate.update({ where: { id: mandate.id }, data: { status: "ACTIVE" } });
      await activatePlanMembershipAfterMandate(practiceId, planPatientId);
      newStatus = "ACTIVE";
      action = "activated";
    } else if (outcome === "fail") {
      await db.planMandate.update({ where: { id: mandate.id }, data: { status: "FAILED" } });
      await db.planPatient.update({ where: { id: planPatientId }, data: { status: "PAUSED" } });
      newStatus = "FAILED";
      action = "failed";
    } else if (outcome === "cancel") {
      const gcStatus = gcMandate?.status as string;
      newStatus = gcStatus === "cancelled" ? "CANCELLED" : "EXPIRED";
      await db.planMandate.update({ where: { id: mandate.id }, data: { status: newStatus as "CANCELLED" | "EXPIRED" } });
      if (gcStatus === "cancelled") {
        await db.planPatient.update({ where: { id: planPatientId }, data: { status: "CANCELLED" } });
      }
      action = "cancelled";
    }

    results.push({
      mandateId: mandate.id,
      gocardlessMandateId: mandate.gocardlessMandateId,
      previousStatus: mandate.status,
      newStatus,
      action,
    });
  }

  return { checked: mandates.length, results, discovery };
}

/** Bulk discover/link GoCardless mandates for patients missing an active mandate (P2.6). */
export async function bulkCheckGoCardlessMandates(practiceId: string) {
  const db = scopedDb(practiceId);
  const candidates = await db.planPatient.findMany({
    where: {
      status: { in: ["INVITED", "SIGNED", "ACTIVE", "PAUSED"] },
      patient: { email: { not: null } },
      mandates: { none: { status: "ACTIVE" } },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  let linked = 0;
  let checked = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    checked++;
    try {
      const result = await discoverAndLinkGoCardlessMandate(practiceId, candidate.id);
      linked += result.linked;
      if (result.errors.length > 0) errors.push(...result.errors);
      if (result.linked > 0) {
        await checkPlanPatientGoCardless(practiceId, candidate.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Patient ${candidate.id}: ${message}`);
    }
  }

  return { checked, linked, errors: errors.slice(0, 50) };
}

export { getMandate, getCustomer };
