import { NextResponse } from "next/server";
import { prisma } from "@elio/db";

/**
 * TEST-ONLY route (see e2e-signup/route.ts for the guard rationale). Lets the
 * Playwright suite make real DB assertions (PlanPatient/PatientPlanEnrolment
 * flipping to ACTIVE, the mandate row that resulted) without importing
 * @elio/db's Node client directly into the Playwright test process.
 */
export const runtime = "nodejs";

function guard() {
  return process.env.GOCARDLESS_MOCK_MODE === "true";
}

export async function GET(req: Request) {
  if (!guard()) return NextResponse.json({ error: "not available" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const planPatientId = searchParams.get("planPatientId");
  const enrolmentId = searchParams.get("enrolmentId");
  if (!planPatientId || !enrolmentId) {
    return NextResponse.json({ error: "planPatientId and enrolmentId are required" }, { status: 400 });
  }

  const planPatient = await prisma.planPatient.findUnique({
    where: { id: planPatientId },
    include: { mandates: true, payments: true },
  });
  const enrolment = await prisma.patientPlanEnrolment.findUnique({ where: { id: enrolmentId } });

  return NextResponse.json({
    planPatientStatus: planPatient?.status ?? null,
    enrolmentStatus: enrolment?.status ?? null,
    mandate: planPatient?.mandates[0]
      ? { id: planPatient.mandates[0].id, gocardlessMandateId: planPatient.mandates[0].gocardlessMandateId, status: planPatient.mandates[0].status }
      : null,
    paymentCount: planPatient?.payments.length ?? 0,
  });
}
