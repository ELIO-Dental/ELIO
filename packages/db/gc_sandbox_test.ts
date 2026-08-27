import { prisma } from "./client";

async function main() {
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("no practice");

  const patient = await prisma.patient.create({
    data: {
      practiceId: practice.id,
      dentallyId: `gc-sandbox-test-${Date.now()}`,
      firstName: "Sandbox",
      lastName: "Test",
      email: "sandbox-test@example.com",
    },
  });

  let plan = await prisma.planModel.findFirst({ where: { practiceId: practice.id, isCurrentVersion: true } });
  if (!plan) {
    plan = await prisma.planModel.create({
      data: { practiceId: practice.id, name: "Sandbox Test Plan", monthlyPricePence: 1999, isCurrentVersion: true },
    });
  }

  const planPatient = await prisma.planPatient.create({
    data: { practiceId: practice.id, patientId: patient.id, status: "INVITED", planModelId: plan.id },
  });

  const enrolment = await prisma.patientPlanEnrolment.create({
    data: { practiceId: practice.id, planPatientId: planPatient.id, planId: plan.id, status: "PENDING" },
  });

  let doc = await prisma.planDocument.findFirst({ where: { practiceId: practice.id } });
  if (!doc) {
    doc = await prisma.planDocument.create({
      data: {
        practiceId: practice.id,
        type: "TERMS_AND_CONDITIONS",
        title: "Sandbox Test Terms",
        content: "<p>Test terms</p>",
        version: "1.0",
        effectiveDate: new Date(),
      },
    });
  }

  const token = `gc-sandbox-${Date.now()}`;
  const signingRequest = await prisma.planSigningRequest.create({
    data: {
      practiceId: practice.id,
      planPatientId: planPatient.id,
      documentId: doc.id,
      token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });

  console.log(JSON.stringify({
    token: signingRequest.token,
    patientId: patient.id,
    planId: plan.id,
    planPatientId: planPatient.id,
    enrolmentId: enrolment.id,
    documentId: doc.id,
  }));
}

main().finally(() => prisma.$disconnect());
