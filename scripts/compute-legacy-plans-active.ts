/**
 * Read-only: compute legacy ElioPlans Active Members from old unmapped tables.
 * Does not write.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@elio/db";

async function exists(name: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    name
  );
  return Boolean(rows[0]?.exists);
}

async function main() {
  const tables = ["Patient", "PatientPlan", "Mandate", "Plan", "Payment"];
  for (const t of tables) {
    console.log(`${t}: ${await exists(t)}`);
  }

  if (!(await exists("PatientPlan"))) {
    console.log("No legacy PatientPlan table — cannot compute legacy active members from DB");
    await prisma.$disconnect();
    return;
  }

  // Approximate legacy active members: ACTIVE PatientPlan with ACTIVE mandate
  // (mirrors new mandate-aware formula as closely as old schema allows)
  const cols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'PatientPlan' ORDER BY ordinal_position`
  );
  console.log("PatientPlan columns:", cols.map((c) => c.column_name).join(", "));

  const mandateExists = await exists("Mandate");
  let activeMembers = 0;
  if (mandateExists) {
    const mCols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Mandate' ORDER BY ordinal_position`
    );
    console.log("Mandate columns:", mCols.map((c) => c.column_name).join(", "));

    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count
       FROM "PatientPlan" pp
       WHERE pp.status = 'ACTIVE'
         AND EXISTS (
           SELECT 1 FROM "Mandate" m
           WHERE m."patientId" = pp."patientId"
             AND m.status = 'ACTIVE'
         )`
    );
    activeMembers = Number(rows[0]?.count ?? 0);
  } else {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "PatientPlan" WHERE status = 'ACTIVE'`
    );
    activeMembers = Number(rows[0]?.count ?? 0);
  }

  const totalActivePlans = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "PatientPlan" WHERE status = 'ACTIVE'`
  );

  const out = {
    source: "legacy-elioplans-tables",
    activeMembersMandateAware: activeMembers,
    activePatientPlans: Number(totalActivePlans[0]?.count ?? 0),
    exportedAt: new Date().toISOString(),
  };
  writeFileSync(join(process.cwd(), "parity-exports", "legacy-plans-active-members.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
