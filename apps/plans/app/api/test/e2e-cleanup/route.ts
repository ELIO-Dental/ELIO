import { NextResponse } from "next/server";
import { prisma } from "@elio/db";

/**
 * TEST-ONLY route (see e2e-signup/route.ts for the guard rationale). Deletes,
 * by id, every row a single e2e run created — run from the suite's
 * afterAll/afterEach so the shared dev database's baseline row counts
 * (documented in project-docs/PROJECT_STATE.md) are unchanged after the run.
 */
export const runtime = "nodejs";

function guard() {
  return process.env.GOCARDLESS_MOCK_MODE === "true";
}

export async function POST(req: Request) {
  if (!guard()) return NextResponse.json({ error: "not available" }, { status: 404 });

  const body = await req.json();
  const { patientId, planPatientId, planId, documentId } = body as {
    patientId?: string;
    planPatientId?: string;
    planId?: string;
    documentId?: string;
  };

  if (planPatientId) {
    await prisma.planPayment.deleteMany({ where: { planPatientId } });
    await prisma.planMandate.deleteMany({ where: { planPatientId } });
    await prisma.planDocumentAcceptance.deleteMany({ where: { planPatientId } });
    await prisma.planSigningRequest.deleteMany({ where: { planPatientId } });
    await prisma.patientPlanEnrolment.deleteMany({ where: { planPatientId } });
    await prisma.planPatient.deleteMany({ where: { id: planPatientId } });
  }
  if (patientId) await prisma.patient.deleteMany({ where: { id: patientId } });
  if (planId) await prisma.planModel.deleteMany({ where: { id: planId } });
  if (documentId) await prisma.planDocument.deleteMany({ where: { id: documentId } });

  return NextResponse.json({ deleted: true });
}
