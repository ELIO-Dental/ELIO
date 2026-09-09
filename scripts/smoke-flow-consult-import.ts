/**
 * Flow consult import smoke: run twice, assert no duplicate consults per patient,
 * and report practitioner fill rate.
 *
 * Usage: npx tsx scripts/smoke-flow-consult-import.ts [--execute]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(resolve(__dirname, "../packages/db/.env"));
loadEnv(resolve(__dirname, "../../elio-deploy-env/flow.env"));
loadEnv(resolve(__dirname, "../../elio-deploy-env/pay.env"));

const EXECUTE = process.argv.includes("--execute");
const PRACTICE_ID = process.env.PRACTICE_ID || "seed-practice";

async function main() {
  const { prisma } = await import("@elio/db");
  const before = await prisma.consult.count({ where: { practiceId: PRACTICE_ID } });
  const withPracBefore = await prisma.consult.count({
    where: { practiceId: PRACTICE_ID, practitionerDentistId: { not: null } },
  });
  console.log({ before, withPracBefore });

  if (!EXECUTE) {
    console.log("Dry-run. Pass --execute to import twice.");
    await prisma.$disconnect();
    return;
  }

  const { importCosmeticConsultsFromDentally } = await import("@elio/dentally");
  console.log("Import #1…");
  const r1 = await importCosmeticConsultsFromDentally(PRACTICE_ID);
  console.log(r1);
  console.log("Import #2…");
  const r2 = await importCosmeticConsultsFromDentally(PRACTICE_ID);
  console.log(r2);

  if (r2.created > 0) {
    throw new Error(`Re-import created ${r2.created} consults — expected 0 (duplicates)`);
  }

  const after = await prisma.consult.count({ where: { practiceId: PRACTICE_ID } });
  const withPracAfter = await prisma.consult.count({
    where: { practiceId: PRACTICE_ID, practitionerDentistId: { not: null } },
  });

  const dupPatients = await prisma.$queryRaw<Array<{ patientId: string; c: bigint }>>`
    SELECT e."patientId" AS "patientId", COUNT(*)::bigint AS c
    FROM "flow_consults" c
    JOIN "flow_enquiries" e ON e.id = c."enquiryId"
    WHERE c."practiceId" = ${PRACTICE_ID}
      AND e."patientId" IS NOT NULL
    GROUP BY e."patientId"
    HAVING COUNT(*) > 1
    LIMIT 10
  `.catch(async () => {
    // Fallback via Prisma group if table map differs
    const consults = await prisma.consult.findMany({
      where: { practiceId: PRACTICE_ID },
      select: { enquiry: { select: { patientId: true } } },
    });
    const counts = new Map<string, number>();
    for (const c of consults) {
      const pid = c.enquiry.patientId;
      if (!pid) continue;
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n > 1)
      .slice(0, 10)
      .map(([patientId, c]) => ({ patientId, c: BigInt(c) }));
  });

  if (dupPatients.length > 0) {
    console.error("Duplicate consults per patient:", dupPatients);
    throw new Error(`Found ${dupPatients.length} patients with multiple consults`);
  }

  console.log({
    after,
    withPracAfter,
    practitionerFillPct: after ? Math.round((withPracAfter / after) * 100) : 0,
  });
  console.log("SMOKE OK");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  try {
    const { prisma } = await import("@elio/db");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
});
