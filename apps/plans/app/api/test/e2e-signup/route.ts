import { NextResponse } from "next/server";
import { prisma } from "@elio/db";
import { randomUUID } from "crypto";

/**
 * TEST-ONLY route, used exclusively by the Playwright e2e suite
 * (apps/plans/e2e/signup.spec.ts) to create a real signup invite (Patient /
 * PlanPatient / PlanModel / PlanDocument / PlanSigningRequest / PENDING
 * PatientPlanEnrolment) the same shape a staff member creates through the
 * real product, then hand back the public token so the suite can drive the
 * actual unauthenticated /signup/[token] UI against it.
 *
 * Hard-gated: refuses unless GOCARDLESS_MOCK_MODE=true AND the host is not
 * a production / Vercel deployment (previous leak wrote E2E plans into live Neon).
 */
export const runtime = "nodejs";

function guard() {
  if (process.env.GOCARDLESS_MOCK_MODE !== "true") return false;
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV === "production") return false;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_E2E_SEED !== "true") return false;
  const appUrl = `${process.env.APP_URL ?? ""} ${process.env.NEXTAUTH_URL ?? ""} ${process.env.NEXT_PUBLIC_APP_URL ?? ""}`;
  if (/elioportal\.co\.uk/i.test(appUrl) && process.env.ALLOW_E2E_ON_PROD_HOST !== "true") return false;
  // Known live Aura Neon — never seed E2E rows here unless explicitly overridden.
  const db = process.env.DATABASE_URL ?? "";
  if (/ep-lucky-glade/i.test(db) && process.env.ALLOW_E2E_ON_SHARED_DB !== "true") return false;
  return true;
}

export async function POST(req: Request) {
  if (!guard()) return NextResponse.json({ error: "not available" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const requestedPracticeId = typeof body?.practiceId === "string" ? body.practiceId.trim() : "";

  const practice = requestedPracticeId
    ? await prisma.practice.findUnique({ where: { id: requestedPracticeId }, select: { id: true } })
    : await prisma.practice.findFirst({ select: { id: true } });
  if (!practice) return NextResponse.json({ error: "no practice found to seed against" }, { status: 500 });

  const suffix = randomUUID().slice(0, 8);

  const document = await prisma.planDocument.create({
    data: {
      practiceId: practice.id,
      type: "TERMS_AND_CONDITIONS",
      title: `E2E Test Terms ${suffix}`,
      content: "<p>E2E test terms and conditions.</p>",
      version: "1.0",
      effectiveDate: new Date(),
      isActive: true,
    },
  });

  const plan = await prisma.planModel.create({
    data: {
      practiceId: practice.id,
      name: `E2E Test Plan ${suffix}`,
      monthlyPricePence: 1999,
      publicDescription: "E2E test plan",
      isCurrentVersion: true,
    },
  });

  const patient = await prisma.patient.create({
    data: {
      practiceId: practice.id,
      dentallyId: `e2e-${suffix}`,
      firstName: "E2E",
      lastName: `Tester ${suffix}`,
      email: `e2e-tester-${suffix}@example.test`,
    },
  });

  const planPatient = await prisma.planPatient.create({
    data: { practiceId: practice.id, patientId: patient.id, status: "INVITED", planModelId: plan.id },
  });

  const enrolment = await prisma.patientPlanEnrolment.create({
    data: { practiceId: practice.id, planPatientId: planPatient.id, planId: plan.id, status: "PENDING" },
  });

  const token = `e2e-${randomUUID()}`;
  const signingRequest = await prisma.planSigningRequest.create({
    data: {
      practiceId: practice.id,
      planPatientId: planPatient.id,
      documentId: document.id,
      token,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return NextResponse.json({
    token: signingRequest.token,
    practiceId: practice.id,
    patientId: patient.id,
    planId: plan.id,
    planPatientId: planPatient.id,
    enrolmentId: enrolment.id,
    documentId: document.id,
  });
}
