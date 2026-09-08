/**
 * Deduplicate PlanDocumentAcceptance to one row per (planPatientId, documentId).
 * Keep earliest acceptedAt. Fixes over-restore from loose document matching.
 *
 *   CONFIRM_WRITE=1 npx tsx scripts/dedupe-plans-acceptances.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string, force = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
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

loadEnvFile(join(process.cwd(), "..", "elio-deploy-env", "plans.env"), true);
loadEnvFile(join(process.cwd(), "packages", "db", ".env"));
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

const WRITE = process.env.CONFIRM_WRITE === "1";
const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";

async function main() {
  const { prisma } = await import("@elio/db");
  const rows = await prisma.planDocumentAcceptance.findMany({
    where: { practiceId: PRACTICE_ID },
    orderBy: { acceptedAt: "asc" },
  });
  const keep = new Set<string>();
  const deleteIds: string[] = [];
  for (const r of rows) {
    const key = `${r.planPatientId}::${r.documentId}`;
    if (keep.has(key)) deleteIds.push(r.id);
    else keep.add(key);
  }
  console.log(`acceptances=${rows.length} unique=${keep.size} duplicates=${deleteIds.length}`);
  if (WRITE && deleteIds.length) {
    await prisma.planDocumentAcceptance.deleteMany({ where: { id: { in: deleteIds } } });
    console.log(`deleted ${deleteIds.length}`);
  } else if (!WRITE) {
    console.log("dry-run — set CONFIRM_WRITE=1 to delete duplicates");
  }

  // Also list PlanPatients that look like duplicate of same core patient
  const pps = await prisma.planPatient.findMany({
    where: { practiceId: PRACTICE_ID },
    include: { patient: { select: { dentallyId: true, email: true, firstName: true, lastName: true } } },
  });
  const byDentally = new Map<string, typeof pps>();
  for (const p of pps) {
    const k = p.patient.dentallyId;
    if (!byDentally.has(k)) byDentally.set(k, []);
    byDentally.get(k)!.push(p);
  }
  const dups = [...byDentally.entries()].filter(([, v]) => v.length > 1);
  console.log(`duplicate PlanPatients by dentallyId: ${dups.length}`);
  for (const [k, v] of dups.slice(0, 10)) {
    console.log(`  dentally=${k} ×${v.length} ${v.map((x) => x.id).join(", ")}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
