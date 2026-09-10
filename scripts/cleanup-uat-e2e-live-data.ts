/**
 * Remove UAT / E2E / smoke seed rows from live seed-practice (and orphan e2e practices).
 * Does NOT delete real Dentally-backed clinical data.
 *
 * Dry-run:
 *   npx tsx scripts/cleanup-uat-e2e-live-data.ts
 * Apply:
 *   CONFIRM_DELETE=1 npx tsx scripts/cleanup-uat-e2e-live-data.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@elio/db";

function loadEnv(filePath: string, force = false) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (force || !process.env[key]) process.env[key] = val;
  }
}

loadEnv(resolve(__dirname, "../packages/db/.env"));
loadEnv(resolve(__dirname, "../apps/shell/.env.local"));
loadEnv(resolve(__dirname, "../../elio-deploy-env/pay.env"), true);
loadEnv(resolve(__dirname, "../../elio-deploy-env/plans.env"), true);
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";
const APPLY = process.env.CONFIRM_DELETE === "1";

const E2E_PRACTICE_IDS = [
  "e2e-integrations-practice",
  "e2e-portal-nav-practice",
  "e2e-brand-logo-practice",
] as const;

function isTestDentistName(name: string): boolean {
  const n = name.trim();
  return (
    n.startsWith("[UAT]") ||
    n.startsWith("UAT ") ||
    n.startsWith("UAT Pay") ||
    n.startsWith("E2E ") ||
    n.startsWith("E2E Dentally") ||
    /^UAT Pay Dentist/i.test(n) ||
    /^E2E Dentally/i.test(n)
  );
}

async function deletePayslipCascade(payslipEntryId: string) {
  await prisma.privateRevenueLineItem.deleteMany({ where: { payslipEntryId } });
  await prisma.payslipVersion.deleteMany({ where: { payslipEntryId } }).catch(() => undefined);
  await prisma.payslipEntry.delete({ where: { id: payslipEntryId } });
}

async function deleteDentistCascade(dentistId: string) {
  const payslips = await prisma.payslipEntry.findMany({
    where: { dentistId },
    select: { id: true },
  });
  for (const p of payslips) await deletePayslipCascade(p.id);

  await prisma.hourEntry.deleteMany({ where: { dentistId } }).catch(() => undefined);
  await prisma.labBillEntry.updateMany({
    where: { dentistId },
    data: { dentistId: null },
  }).catch(() => undefined);
  await prisma.consult.updateMany({
    where: { practitionerDentistId: dentistId },
    data: { practitionerDentistId: null },
  }).catch(() => undefined);

  await prisma.dentist.delete({ where: { id: dentistId } });
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
  await prisma.planPatient.updateMany({
    where: { parentPatientId: planPatientId },
    data: { parentPatientId: null },
  });
  await prisma.planPatient.delete({ where: { id: planPatientId } });
}

async function deleteE2ePractice(practiceId: string) {
  const p = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { id: true, name: true },
  });
  if (!p) {
    console.log(`  skip practice ${practiceId} (gone)`);
    return;
  }
  console.log(`  deleting orphan practice "${p.name}" (${p.id})`);
  if (!APPLY) return;

  await prisma.dentallySyncRun.deleteMany({ where: { practiceId } });
  await prisma.licence.deleteMany({ where: { practiceId } });
  await prisma.user.deleteMany({ where: { practiceId } });
  await prisma.practice.delete({ where: { id: practiceId } });
}

async function main() {
  console.log("\n=== CLEANUP UAT / E2E LIVE DATA ===");
  console.log(`practice=${PRACTICE_ID}`);
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: dry-run (CONFIRM_DELETE=1 to apply)\n");

  // --- Pay: test dentists ---
  const allDentists = await prisma.dentist.findMany({
    where: { practiceId: PRACTICE_ID },
    select: {
      id: true,
      name: true,
      dentallyPractitionerId: true,
      active: true,
      _count: { select: { payslipEntries: true } },
    },
  });
  const testDentists = allDentists.filter(
    (d) =>
      isTestDentistName(d.name) ||
      (d.dentallyPractitionerId?.startsWith("e2e-") ?? false) ||
      (d.dentallyPractitionerId?.startsWith("uat-") ?? false)
  );
  console.log(`Pay test dentists: ${testDentists.length}`);
  for (const d of testDentists) {
    console.log(
      `  - ${d.name} id=${d.id} prac=${d.dentallyPractitionerId ?? "—"} payslips=${d._count.payslipEntries}`
    );
  }

  // --- Pay: UAT/E2E line items on any payslip ---
  const testLines = await prisma.privateRevenueLineItem.findMany({
    where: {
      payslipEntry: { practiceId: PRACTICE_ID },
      OR: [
        { patientName: { startsWith: "E2E" } },
        { patientName: { startsWith: "UAT" } },
        { patientName: { equals: "SMOKE MANUAL PLUG" } },
        { patientName: { contains: "E2E Patient" } },
        { patientName: { contains: "UAT Patient" } },
      ],
    },
    select: {
      id: true,
      patientName: true,
      sourceType: true,
      payslipEntryId: true,
      payslipEntry: { select: { dentistId: true, payPeriodId: true } },
    },
  });
  console.log(`\nPay test revenue lines: ${testLines.length}`);
  for (const l of testLines.slice(0, 20)) {
    console.log(`  - ${l.patientName} (${l.sourceType}) line=${l.id}`);
  }
  if (testLines.length > 20) console.log(`  … +${testLines.length - 20} more`);

  // --- Pay: empty singleton periods that only hold test dentists ---
  const testDentistIds = new Set(testDentists.map((d) => d.id));
  const recentPeriods = await prisma.payPeriod.findMany({
    where: { practiceId: PRACTICE_ID },
    orderBy: { periodStart: "desc" },
    take: 12,
    select: {
      id: true,
      periodStart: true,
      status: true,
      payslipEntries: { select: { id: true, dentistId: true } },
    },
  });
  const periodsOnlyTest = recentPeriods.filter((p) => {
    if (p.payslipEntries.length === 0) return false;
    return p.payslipEntries.every((e) => testDentistIds.has(e.dentistId));
  });
  console.log(`\nPay periods that only contain test dentists: ${periodsOnlyTest.length}`);
  for (const p of periodsOnlyTest) {
    console.log(`  - ${p.id} start=${p.periodStart.toISOString().slice(0, 10)} slips=${p.payslipEntries.length}`);
  }

  // --- Flow: consults attributed to test dentists / UAT notes ---
  const testConsults = await prisma.consult.findMany({
    where: {
      practiceId: PRACTICE_ID,
      OR: [
        ...(testDentists.length
          ? [{ practitionerDentistId: { in: testDentists.map((d) => d.id) } }]
          : []),
        { notes: { contains: "UAT test", mode: "insensitive" } },
        { notes: { contains: "E2E", mode: "insensitive" } },
      ],
    },
    select: { id: true, enquiryId: true },
    take: 500,
  });
  const testEnquiryIds = [...new Set(testConsults.map((c) => c.enquiryId).filter(Boolean))];
  console.log(`\nFlow test consults: ${testConsults.length}`);
  console.log(`Flow enquiries linked to those consults: ${testEnquiryIds.length}`);

  // --- Plans / patients: e2e ids & emails ---
  const testPatients = await prisma.patient.findMany({
    where: {
      practiceId: PRACTICE_ID,
      OR: [
        { dentallyId: { startsWith: "e2e-" } },
        { dentallyId: { startsWith: "uat-" } },
        { dentallyId: { startsWith: "gc-sandbox-test-" } },
        { email: { endsWith: "@example.test" } },
        { email: { equals: "sandbox-test@example.com" } },
        { AND: [{ firstName: "E2E" }, { lastName: { startsWith: "Tester" } }] },
        { AND: [{ firstName: "Sandbox" }, { lastName: "Test" }] },
        { firstName: { startsWith: "UAT " } },
        { lastName: { startsWith: "UAT " } },
      ],
    },
    select: { id: true, firstName: true, lastName: true, email: true, dentallyId: true },
  });
  console.log(`\nCore test patients: ${testPatients.length}`);
  for (const p of testPatients.slice(0, 15)) {
    console.log(`  - ${p.firstName} ${p.lastName} <${p.email}> dentally=${p.dentallyId}`);
  }

  const testPatientIds = testPatients.map((p) => p.id);
  const planPatients = testPatientIds.length
    ? await prisma.planPatient.findMany({
        where: { practiceId: PRACTICE_ID, patientId: { in: testPatientIds } },
        select: { id: true },
      })
    : [];
  console.log(`Linked plan patients: ${planPatients.length}`);

  const testPlans = await prisma.planModel.findMany({
    where: {
      practiceId: PRACTICE_ID,
      OR: [
        { name: { startsWith: "E2E" } },
        { name: { startsWith: "UAT" } },
        { name: { equals: "Sandbox Test Plan" } },
      ],
    },
    select: { id: true, name: true },
  });
  console.log(`Test plan models: ${testPlans.length}`);
  for (const p of testPlans) console.log(`  - ${p.name}`);

  // --- Orphan e2e practices ---
  console.log("\nOrphan e2e practices:");
  for (const id of E2E_PRACTICE_IDS) {
    const p = await prisma.practice.findUnique({ where: { id }, select: { id: true, name: true } });
    console.log(p ? `  - ${p.name} (${p.id})` : `  - ${id}: already gone`);
  }

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with CONFIRM_DELETE=1 to apply.");
    return;
  }

  console.log("\n--- APPLYING ---");

  // 1) Delete UAT/E2E lines first (even on real dentists)
  if (testLines.length) {
    const ids = testLines.map((l) => l.id);
    const r = await prisma.privateRevenueLineItem.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted ${r.count} test revenue lines`);
  }

  // 2) Delete test dentists (+ their remaining payslips)
  for (const d of testDentists) {
    await deleteDentistCascade(d.id);
    console.log(`Deleted dentist ${d.name}`);
  }

  // 3) Delete periods that only had test dentists (now empty or only-test)
  for (const p of periodsOnlyTest) {
    const left = await prisma.payslipEntry.count({ where: { payPeriodId: p.id } });
    if (left === 0) {
      await prisma.payPeriod.delete({ where: { id: p.id } });
      console.log(`Deleted empty test-only period ${p.id}`);
    }
  }

  // 4) Flow test rows (consults first, then orphaned enquiries)
  if (testConsults.length) {
    const ids = testConsults.map((c) => c.id);
    await prisma.reminder.deleteMany({ where: { consultId: { in: ids } } }).catch(() => undefined);
    const r = await prisma.consult.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted ${r.count} test consults`);
  }
  if (testEnquiryIds.length) {
    // only delete enquiries that no longer have consults
    const stillLinked = await prisma.consult.findMany({
      where: { enquiryId: { in: testEnquiryIds } },
      select: { enquiryId: true },
    });
    const still = new Set(stillLinked.map((c) => c.enquiryId));
    const orphanIds = testEnquiryIds.filter((id) => !still.has(id));
    if (orphanIds.length) {
      const r = await prisma.enquiry.deleteMany({ where: { id: { in: orphanIds } } });
      console.log(`Deleted ${r.count} orphan test enquiries`);
    }
  }

  // 5) Plans / patients
  for (const pp of planPatients) {
    await deletePlanPatientCascade(pp.id);
  }
  if (planPatients.length) console.log(`Deleted ${planPatients.length} plan patients`);

  if (testPatientIds.length) {
    await prisma.consult.updateMany({
      where: { practiceId: PRACTICE_ID /* patient link via enquiry */ },
      data: {},
    }).catch(() => undefined);
    // unlink appointments/invoices stay; delete patient rows that are synthetic
    const r = await prisma.patient.deleteMany({ where: { id: { in: testPatientIds } } });
    console.log(`Deleted ${r.count} test core patients`);
  }

  for (const plan of testPlans) {
    const live = await prisma.patientPlanEnrolment.count({
      where: { planModelId: plan.id, status: { in: ["PENDING", "ACTIVE", "PAUSED"] } },
    });
    if (live > 0) {
      console.log(`Skip plan model ${plan.name} — still has ${live} live enrolments`);
      continue;
    }
    await prisma.dentallyPlanMapping.deleteMany({ where: { planModelId: plan.id } });
    await prisma.planInclusion.deleteMany({ where: { planModelId: plan.id } }).catch(() => undefined);
    await prisma.planModel.delete({ where: { id: plan.id } });
    console.log(`Deleted plan model ${plan.name}`);
  }

  // 6) Orphan e2e practices
  for (const id of E2E_PRACTICE_IDS) {
    await deleteE2ePractice(id);
  }

  // --- Verify ---
  const leftDentists = (await prisma.dentist.findMany({ where: { practiceId: PRACTICE_ID } })).filter(
    (d) => isTestDentistName(d.name) || d.dentallyPractitionerId?.startsWith("e2e-") || d.dentallyPractitionerId?.startsWith("uat-")
  );
  const leftLines = await prisma.privateRevenueLineItem.count({
    where: {
      payslipEntry: { practiceId: PRACTICE_ID },
      OR: [
        { patientName: { startsWith: "E2E" } },
        { patientName: { startsWith: "UAT" } },
        { patientName: { equals: "SMOKE MANUAL PLUG" } },
      ],
    },
  });
  const leftPatients = await prisma.patient.count({
    where: {
      practiceId: PRACTICE_ID,
      OR: [
        { dentallyId: { startsWith: "e2e-" } },
        { email: { endsWith: "@example.test" } },
      ],
    },
  });

  console.log("\n=== VERIFY ===");
  console.log({ leftTestDentists: leftDentists.length, leftTestLines: leftLines, leftTestPatients: leftPatients });
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
