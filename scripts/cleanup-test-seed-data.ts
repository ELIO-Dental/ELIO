/**
 * Remove ONLY E2E / Developer Test practices + seed role logins.
 * Does NOT touch seed-practice Dentally patients, invoices, Pay/Plans/Flow
 * migrated data, or the live OWNER (mi0364922@gmail.com).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/cleanup-test-seed-data.ts
 *   DATABASE_URL=... CONFIRM_DELETE=1 npx tsx scripts/cleanup-test-seed-data.ts
 */
import { prisma } from "@elio/db";

const TEST_PRACTICE_IDS = [
  "e2e-integrations-practice",
  "cmtgux0jq0000ih040kbwxb2l", // Developer Test
] as const;

/** Seed role logins on seed-practice — not real staff. Keep OWNER + SUPER_ADMIN. */
const SEED_ROLE_EMAILS = [
  "seed.admin@elio.dev",
  "seed.finance@elio.dev",
  "seed.staff@elio.dev",
  "seed.auditor@elio.dev",
  "dev-owner@elio.test",
] as const;

async function deletePracticeCascade(practiceId: string) {
  const p = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { id: true, name: true },
  });
  if (!p) {
    console.log(`  skip — practice ${practiceId} not found`);
    return;
  }
  console.log(`  deleting practice "${p.name}" (${p.id})…`);

  // Order matters: dependents before parents. Keep broad — test practices are small-ish.
  await prisma.reminder.deleteMany({ where: { practiceId } });
  await prisma.consult.deleteMany({ where: { practiceId } });
  await prisma.enquiry.deleteMany({ where: { practiceId } });
  await prisma.legacyFlowTouchPointArchive.deleteMany({ where: { practiceId } });

  await prisma.planPayment.deleteMany({ where: { practiceId } });
  await prisma.planMandate.deleteMany({ where: { practiceId } });
  await prisma.patientPlanEnrolment.deleteMany({ where: { practiceId } });
  await prisma.planDocumentAcceptance.deleteMany({
    where: { planPatient: { practiceId } },
  });
  await prisma.planSigningRequest.deleteMany({ where: { practiceId } });
  await prisma.planRedeem.deleteMany({ where: { practiceId } });
  await prisma.planEmailLog.deleteMany({ where: { practiceId } });
  await prisma.planPatientNote.deleteMany({ where: { practiceId } });
  await prisma.planPatient.deleteMany({ where: { practiceId } });
  await prisma.planRedeemRule.deleteMany({ where: { practiceId } });
  await prisma.planEligibilityRule.deleteMany({ where: { practiceId } });
  await prisma.planDiscount.deleteMany({ where: { practiceId } });
  await prisma.planInclusion.deleteMany({ where: { practiceId } });
  await prisma.planGuideArticle.deleteMany({ where: { practiceId } });
  await prisma.planDocument.deleteMany({ where: { practiceId } });
  await prisma.planPracticeSetting.deleteMany({ where: { practiceId } });
  await prisma.dentallyPlanMapping.deleteMany({ where: { practiceId } });
  await prisma.planModel.deleteMany({ where: { practiceId } });

  await prisma.labBillEntry.deleteMany({ where: { practiceId } });
  await prisma.hourEntry.deleteMany({ where: { dentist: { practiceId } } });
  await prisma.privateRevenueLineItem.deleteMany({
    where: { payslipEntry: { practiceId } },
  });
  await prisma.payLine.deleteMany({
    where: { compassStatement: { practiceId } },
  });
  await prisma.payslipEntry.deleteMany({ where: { practiceId } });
  await prisma.compassStatement.deleteMany({ where: { practiceId } });
  await prisma.payPeriod.deleteMany({ where: { practiceId } });
  await prisma.supplierInvoiceEntry.deleteMany({ where: { practiceId } });
  await prisma.savedLab.deleteMany({ where: { practiceId } });
  await prisma.savedSupplier.deleteMany({ where: { practiceId } });
  await prisma.legacyPayslipArchive.deleteMany({ where: { practiceId } });
  await prisma.dentist.deleteMany({ where: { practiceId } });

  await prisma.treatment.deleteMany({ where: { practiceId } });
  await prisma.appointment.deleteMany({ where: { practiceId } });
  await prisma.invoice.deleteMany({ where: { practiceId } });
  await prisma.dentallyPayment.deleteMany({ where: { practiceId } });
  await prisma.dentallyAccount.deleteMany({ where: { practiceId } });
  await prisma.dentallyPaymentPlan.deleteMany({ where: { practiceId } });
  await prisma.patient.deleteMany({ where: { practiceId } });

  await prisma.dentallySyncRun.deleteMany({ where: { practiceId } });
  await prisma.impersonationSession.deleteMany({ where: { practiceId } });
  await prisma.practiceFeatureFlag.deleteMany({ where: { practiceId } });
  await prisma.licence.deleteMany({ where: { practiceId } });
  await prisma.auditLog.deleteMany({ where: { practiceId } });

  // Users belong to practice — delete after sessions/audit refs
  const users = await prisma.user.findMany({
    where: { practiceId },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { practiceId } });
  }

  await prisma.practice.delete({ where: { id: practiceId } });
  console.log(`  ✓ deleted "${p.name}"`);
}

async function main() {
  const dryRun = process.env.CONFIRM_DELETE !== "1";

  console.log("\n=== CLEANUP TEST / SEED JUNK ===");
  console.log(dryRun ? "MODE: dry-run (set CONFIRM_DELETE=1 to apply)\n" : "MODE: APPLYING DELETES\n");

  for (const id of TEST_PRACTICE_IDS) {
    const p = await prisma.practice.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            patients: true,
            users: true,
            planPatients: true,
            consults: true,
            payPeriods: true,
          },
        },
      },
    });
    if (!p) {
      console.log(`Practice ${id}: already gone`);
      continue;
    }
    console.log(
      `WILL DELETE practice "${p.name}" (${p.id}) patients=${p._count.patients} users=${p._count.users} planPatients=${p._count.planPatients} consults=${p._count.consults} payPeriods=${p._count.payPeriods}`
    );
    if (!dryRun) await deletePracticeCascade(id);
  }

  const seedUsers = await prisma.user.findMany({
    where: { email: { in: [...SEED_ROLE_EMAILS] } },
    select: { id: true, email: true, role: true, practiceId: true },
  });
  console.log("\nWILL DELETE seed role users:");
  for (const u of seedUsers) console.log(`  ${u.email} (${u.role}) practice=${u.practiceId}`);

  if (!dryRun && seedUsers.length) {
    const ids = seedUsers.map((u) => u.id);
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.planPatientNote.updateMany({
      where: { authorId: { in: ids } },
      data: { authorId: null },
    });
    await prisma.planEmailLog.updateMany({
      where: { sentById: { in: ids } },
      data: { sentById: null },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`  ✓ deleted ${ids.length} seed role users`);
  }

  console.log("\n=== KEEP (untouched) ===");
  const keep = await prisma.practice.findUnique({
    where: { id: "seed-practice" },
    select: {
      name: true,
      _count: {
        select: {
          patients: true,
          invoices: true,
          consults: true,
          planPatients: true,
          payPeriods: true,
          users: true,
        },
      },
    },
  });
  if (keep) {
    console.log(
      `Practice "${keep.name}": patients=${keep._count.patients} invoices=${keep._count.invoices} consults=${keep._count.consults} planPatients=${keep._count.planPatients} payPeriods=${keep._count.payPeriods} users=${keep._count.users}`
    );
  }
  const owners = await prisma.user.findMany({
    where: { practiceId: "seed-practice" },
    select: { email: true, role: true },
    orderBy: { email: "asc" },
  });
  console.log("Remaining seed-practice users:", owners.map((u) => `${u.email}/${u.role}`).join(", "));

  if (dryRun) {
    console.log("\nDry-run only. Re-run with CONFIRM_DELETE=1 to apply.");
  } else {
    console.log("\nDone.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
