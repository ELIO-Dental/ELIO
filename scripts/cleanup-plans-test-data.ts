/**
 * Remove Plans E2E / sandbox test rows that leaked onto the live Aura practice.
 * Does NOT touch real Dentally-backed members (e.g. Ow-jen Chen).
 *
 * Dry-run by default:
 *   npx tsx scripts/cleanup-plans-test-data.ts
 * Apply:
 *   CONFIRM_DELETE=1 npx tsx scripts/cleanup-plans-test-data.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@elio/db";

function loadEnvFile(path: string, force = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (force || !process.env[key]) process.env[key] = val;
  }
}

async function deletePlanPatientCascade(planPatientId: string) {
  await prisma.planPayment.deleteMany({ where: { planPatientId } });
  await prisma.planMandate.deleteMany({ where: { planPatientId } });
  await prisma.patientPlanEnrolment.deleteMany({ where: { planPatientId } });
  await prisma.planDocumentAcceptance.deleteMany({ where: { planPatientId } });
  await prisma.planSigningRequest.deleteMany({ where: { planPatientId } });
  await prisma.planRedeem.deleteMany({ where: { planPatientId } });
  await prisma.planEmailLog.deleteMany({ where: { planPatientId } });
  await prisma.planPatientNote.deleteMany({ where: { planPatientId } });
  // Clear child parent refs pointing here
  await prisma.planPatient.updateMany({
    where: { parentPatientId: planPatientId },
    data: { parentPatientId: null },
  });
  await prisma.planPatient.delete({ where: { id: planPatientId } });
}

async function main() {
loadEnvFile(join(process.cwd(), "..", "elio-deploy-env", "plans.env"), true);
loadEnvFile(join(process.cwd(), "packages", "db", ".env"));
loadEnvFile(join(process.cwd(), "apps", "plans", ".env.local"));
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

  const apply = process.env.CONFIRM_DELETE === "1";
  console.log("\n=== CLEANUP PLANS TEST DATA ===");
  console.log(apply ? "MODE: APPLY\n" : "MODE: dry-run (set CONFIRM_DELETE=1 to delete)\n");

  const practiceId = process.env.PRACTICE_ID?.trim() || "seed-practice";

  // --- E2E / sandbox plan models ---
  const testPlans = await prisma.planModel.findMany({
    where: {
      practiceId,
      OR: [
        { name: { startsWith: "E2E Test Plan" } },
        { name: { equals: "Sandbox Test Plan" } },
        { name: { startsWith: "E2E " } },
      ],
    },
    select: { id: true, name: true },
  });
  console.log(`Test plan models: ${testPlans.length}`);
  for (const p of testPlans.slice(0, 10)) console.log(`  - ${p.name} (${p.id})`);
  if (testPlans.length > 10) console.log(`  … +${testPlans.length - 10} more`);

  // --- Test core patients ---
  const testPatients = await prisma.patient.findMany({
    where: {
      practiceId,
      OR: [
        { dentallyId: { startsWith: "e2e-" } },
        { dentallyId: { startsWith: "gc-sandbox-test-" } },
        { email: { endsWith: "@example.test" } },
        { email: { equals: "sandbox-test@example.com" } },
        { AND: [{ firstName: "E2E" }, { lastName: { startsWith: "Tester" } }] },
        { AND: [{ firstName: "Sandbox" }, { lastName: "Test" }] },
      ],
    },
    select: { id: true, dentallyId: true, email: true, firstName: true, lastName: true },
  });
  console.log(`\nTest core patients: ${testPatients.length}`);
  for (const p of testPatients) {
    console.log(`  - ${p.firstName} ${p.lastName} <${p.email}> dentally=${p.dentallyId}`);
  }

  const testPatientIds = testPatients.map((p) => p.id);
  const planPatients = testPatientIds.length
    ? await prisma.planPatient.findMany({
        where: { practiceId, patientId: { in: testPatientIds } },
        select: { id: true, patientId: true },
      })
    : [];
  console.log(`\nLinked plan patients: ${planPatients.length}`);

  // --- E2E documents ---
  const testDocs = await prisma.planDocument.findMany({
    where: {
      practiceId,
      OR: [
        { title: { startsWith: "E2E Test Terms" } },
        { title: { equals: "Sandbox Test Terms" } },
      ],
    },
    select: { id: true, title: true },
  });
  console.log(`Test documents: ${testDocs.length}`);

  // Enrolments referencing test plans (even if patient not matched)
  const testPlanIds = testPlans.map((p) => p.id);
  const enrolOnTestPlans = testPlanIds.length
    ? await prisma.patientPlanEnrolment.findMany({
        where: { practiceId, planId: { in: testPlanIds } },
        select: { id: true, planPatientId: true },
      })
    : [];
  const extraPlanPatientIds = [
    ...new Set([
      ...planPatients.map((p) => p.id),
      ...enrolOnTestPlans.map((e) => e.planPatientId),
    ]),
  ];

  console.log(`\nPlan patients to cascade-delete: ${extraPlanPatientIds.length}`);
  console.log(`Enrolments on test plans: ${enrolOnTestPlans.length}`);

  if (!apply) {
    console.log("\nDry-run complete — no writes.\n");
    await prisma.$disconnect();
    return;
  }

  for (const id of extraPlanPatientIds) {
    await deletePlanPatientCascade(id);
    console.log(`  deleted planPatient ${id}`);
  }

  if (testPlanIds.length) {
    await prisma.planInclusion.deleteMany({ where: { planId: { in: testPlanIds } } });
    await prisma.planDiscount.deleteMany({ where: { planId: { in: testPlanIds } } });
    await prisma.planEligibilityRule.deleteMany({ where: { planId: { in: testPlanIds } } });
    await prisma.dentallyPlanMapping.deleteMany({ where: { planModelId: { in: testPlanIds } } });
    // Clear planPatient.planModelId refs if any remain
    await prisma.planPatient.updateMany({
      where: { planModelId: { in: testPlanIds } },
      data: { planModelId: null },
    });
    await prisma.planModel.deleteMany({ where: { id: { in: testPlanIds } } });
    console.log(`  deleted ${testPlanIds.length} test plan models`);
  }

  if (testDocs.length) {
    const docIds = testDocs.map((d) => d.id);
    await prisma.planDocumentAcceptance.deleteMany({ where: { documentId: { in: docIds } } });
    await prisma.planSigningRequest.deleteMany({ where: { documentId: { in: docIds } } });
    await prisma.planDocument.deleteMany({ where: { id: { in: docIds } } });
    console.log(`  deleted ${docIds.length} test documents`);
  }

  if (testPatientIds.length) {
    // Only delete core patients that have no remaining planPatients
    for (const pid of testPatientIds) {
      const stillLinked = await prisma.planPatient.count({ where: { patientId: pid } });
      if (stillLinked > 0) {
        console.log(`  keep core patient ${pid} — still has ${stillLinked} planPatient link(s)`);
        continue;
      }
      await prisma.patient.delete({ where: { id: pid } });
      console.log(`  deleted core patient ${pid}`);
    }
  }

  console.log("\nCleanup applied.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
