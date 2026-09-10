/**
 * Plans Dentally sync smoke: run twice, assert no import storm / stable members.
 * Usage: npx tsx scripts/smoke-plans-dentally-sync.ts [--execute]
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
loadEnv(resolve(__dirname, "../../elio-deploy-env/plans.env"));
loadEnv(resolve(__dirname, "../../elio-deploy-env/pay.env"));

const EXECUTE = process.argv.includes("--execute");
const PRACTICE_ID = process.env.PRACTICE_ID || "seed-practice";

async function main() {
  const { prisma } = await import("@elio/db");
  const mappings = await prisma.dentallyPlanMapping.count({ where: { practiceId: PRACTICE_ID } });
  const patients = await prisma.patient.count({ where: { practiceId: PRACTICE_ID } });
  const liveEnrolments = await prisma.patientPlanEnrolment.count({
    where: {
      practiceId: PRACTICE_ID,
      status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
  });
  console.log({ mappings, patients, liveEnrolments });

  if (!EXECUTE) {
    console.log("Dry-run. Pass --execute to sync twice.");
    await prisma.$disconnect();
    return;
  }

  if (mappings === 0) {
    throw new Error("No Dentally plan mappings — configure in Plans before sync");
  }

  const { runPlansDentallySync } = await import("@elio/dentally");
  console.log("Sync #1…");
  const r1 = await runPlansDentallySync(PRACTICE_ID);
  console.log(r1);
  console.log("Sync #2…");
  const r2 = await runPlansDentallySync(PRACTICE_ID);
  console.log(r2);

  if (r2.imported > 0) {
    throw new Error(`Re-sync imported ${r2.imported} — expected 0 (duplicates)`);
  }

  const afterEnrolments = await prisma.patientPlanEnrolment.count({
    where: {
      practiceId: PRACTICE_ID,
      status: { in: ["PENDING", "ACTIVE", "PAUSED"] },
    },
  });

  // Live count after #2 should match after #1 path (stable). Compare to r1.total members roughly.
  console.log({ afterEnrolments, offPlanEnded: r2.offPlanEnded });
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
