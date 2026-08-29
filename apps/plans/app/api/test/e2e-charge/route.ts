import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { createCharge, runReconciliation, processWebhookEvent } from "@/lib/plans-service";

/**
 * TEST-ONLY route (see e2e-signup/route.ts for the guard rationale). Given a
 * practiceId + enrolmentId created by e2e-signup, calls the REAL
 * createCharge()/runReconciliation() service functions (same code the real
 * billing cron path uses — see apps/plans/app/api/cron/create-charges'
 * closeout comment for why that cron itself is new this session) so the e2e
 * suite proves an actual GoCardless payment + PlanPayment row + zero-mismatch
 * reconciliation, not a UI-only stub.
 *
 * F.5 Final QA (2026-08-29): createCharge() now genuinely calls GoCardless's
 * createPayment() itself (previously it only wrote a local row with a null
 * gocardlessPaymentId — a real gap, see plans-service.ts's own comment on
 * createCharge for the full story) — under GOCARDLESS_MOCK_MODE, the mock
 * client's payments.create() already returns a real "confirmed" mock
 * payment recorded in its own in-memory store, so the manual
 * __mockGoCardlessSeedPayment() + separate status-update step this route
 * used to need is gone: reconciliation now sees a genuinely matching pair
 * from createCharge()'s own real call, not a hand-simulated one.
 */
export const runtime = "nodejs";

function guard() {
  return process.env.GOCARDLESS_MOCK_MODE === "true";
}

export async function POST(req: Request) {
  if (!guard()) return NextResponse.json({ error: "not available" }, { status: 404 });

  const body = await req.json();
  const { practiceId, planPatientId, enrolmentId, mandateId, gocardlessMandateId, amountPence } = body as {
    practiceId: string;
    planPatientId: string;
    enrolmentId: string;
    mandateId: string;
    gocardlessMandateId: string;
    amountPence: number;
  };

  const chargeDate = new Date();
  const payment = await createCharge(practiceId, {
    planPatientId,
    patientPlanEnrolmentId: enrolmentId,
    mandateId,
    gocardlessMandateId,
    amountPence,
    chargeDate,
  });

  // F.5 Final QA (2026-08-29): simulate the real webhook confirming this
  // exact payment — the same event shape/path the real GoCardless webhook
  // route (processWebhookEvent) handles in production, calling it directly
  // rather than over real signed HTTP since this route is itself already
  // mock-mode-gated. Without this, the freshly-created payment stays
  // PENDING locally while the mock GoCardless client already reports it as
  // "confirmed" — a real, correct STATUS mismatch reconciliation would (and
  // should) flag until the webhook actually arrives, exactly like production.
  if (payment.gocardlessPaymentId) {
    await processWebhookEvent({
      id: `EV_MOCK_${payment.id}`,
      resource_type: "payments",
      action: "confirmed",
      links: { payment: payment.gocardlessPaymentId },
    });
  }

  const period = payment.billingPeriod!;
  const reconciliation = await runReconciliation(practiceId, period);
  const confirmedPayment = await prisma.planPayment.findUniqueOrThrow({ where: { id: payment.id } });

  return NextResponse.json({ payment: confirmedPayment, reconciliation });
}
