/**
 * Read-only live data audit — NO writes, NO seed, NO sync.
 * Usage: DATABASE_URL=... npx tsx scripts/audit-live-data.ts
 */
import { prisma } from "@elio/db";

async function main() {
  console.log("\n=== LIVE DATA AUDIT (read-only) ===\n");

  const practices = await prisma.practice.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      onboardingStatus: true,
      dentallyConnectionStatus: true,
      _count: {
        select: {
          patients: true,
          appointments: true,
          invoices: true,
          consults: true,
          payPeriods: true,
          planPatients: true,
          dentallyPlanMappings: true,
          users: true,
          licences: true,
        },
      },
    },
  });

  for (const p of practices) {
    console.log(`Practice: ${p.name}`);
    console.log(`  id: ${p.id}`);
    console.log(`  onboarding: ${p.onboardingStatus} | dentally: ${p.dentallyConnectionStatus}`);
    console.log(`  users=${p._count.users} licences=${p._count.licences}`);
    console.log(
      `  patients=${p._count.patients} appointments=${p._count.appointments} invoices=${p._count.invoices}`
    );
    console.log(
      `  consults=${p._count.consults} planPatients=${p._count.planPatients} mappings=${p._count.dentallyPlanMappings} payPeriods=${p._count.payPeriods}`
    );

    // Duplicate risk checks
    const dupPatients = await prisma.$queryRawUnsafe<
      { dentally_id: string; cnt: bigint }[]
    >(
      `SELECT "dentallyId" as dentally_id, COUNT(*)::bigint as cnt
       FROM dentally_patients WHERE "practiceId" = $1
       GROUP BY "dentallyId" HAVING COUNT(*) > 1 LIMIT 5`,
      p.id
    );

    const dupConsultAppts = await prisma.$queryRawUnsafe<
      { appointment_id: string; cnt: bigint }[]
    >(
      `SELECT "appointmentId" as appointment_id, COUNT(*)::bigint as cnt
       FROM flow_consults
       WHERE "practiceId" = $1 AND "appointmentId" IS NOT NULL
       GROUP BY "appointmentId" HAVING COUNT(*) > 1 LIMIT 5`,
      p.id
    );

    const stuckRuns = await prisma.dentallySyncRun.count({
      where: { practiceId: p.id, status: "RUNNING" },
    });
    const lastOk = await prisma.dentallySyncRun.findFirst({
      where: { practiceId: p.id, status: { in: ["SUCCESS", "PARTIAL"] } },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true, finishedAt: true, status: true },
    });

    console.log(
      `  dup patients by dentallyId: ${dupPatients.length === 0 ? "none ✓" : "⚠ " + JSON.stringify(dupPatients)}`
    );
    console.log(
      `  dup consults by appointmentId: ${dupConsultAppts.length === 0 ? "none ✓" : "⚠ " + JSON.stringify(dupConsultAppts)}`
    );
    console.log(`  stuck RUNNING syncs: ${stuckRuns}`);
    console.log(
      `  last successful sync: ${lastOk ? `${lastOk.status} @ ${lastOk.startedAt.toISOString()}` : "never (waiting Inngest)"}`
    );
    console.log("");
  }

  console.log("=== SAFETY RULES ===");
  console.log("DO NOT run: npm run seed  (would only upsert seed-practice users — avoid on live)");
  console.log("SAFE: Dentally sync uses upsert by [practiceId, dentallyId] — no patient dupes");
  console.log("SAFE: Flow consult import skips appointments that already have a consult");
  console.log("SAFE: verify:* and staging-snapshot scripts are READ-ONLY");
  console.log("AVOID: creating new pay periods / re-importing legacy migration scripts\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
