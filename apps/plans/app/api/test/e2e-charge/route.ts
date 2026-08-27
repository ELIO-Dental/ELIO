import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { createCharge, runReconciliation } from "@/lib/plans-service";
import { __mockGoCardlessSeedPayment } from "@elio/plans-engine";

/**
 * TEST-ONLY route (see e2e-signup/route.ts for the guard rationale). Given a
 * practiceId + enrolmentId created by e2e-signup, calls the REAL
 * createCharge()/runReconciliation() service functions (same code the real
 * billing cron/webhook path uses) so the e2e suite proves an actual PlanPayment
 * row and a zero-mismatch reconciliation, not a UI-only stub.
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
    amountPence,
    chargeDate,
  });

  // Simulate GoCardless having also confirmed this exact charge, so
  // reconciliation (which compares our local PlanPayment rows against
  // GoCardless's own payment list for the period) sees a matching pair
  // instead of flagging a mismatch for a payment GoCardless "never received".
  const gcPaymentId = `PM_MOCK_RECON_${payment.id}`;
  __mockGoCardlessSeedPayment({
    id: gcPaymentId,
    amount: amountPence,
    status: "confirmed",
    chargeDate: chargeDate.toISOString().slice(0, 10),
    mandateId: gocardlessMandateId,
  });
  const updated = await prisma.planPayment.update({
    where: { id: payment.id },
    data: { gocardlessPaymentId: gcPaymentId, status: "CONFIRMED" },
  });

  const period = payment.billingPeriod!;
  const reconciliation = await runReconciliation(practiceId, period);

  return NextResponse.json({ payment: updated, reconciliation });
}
