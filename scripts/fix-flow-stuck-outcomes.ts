/**
 * Fix consult outcomes that were migrated as DECLINED for stuck reasons.
 * Canonical mapping (legacyStatusToOutcome): stuck reasons → THINKING.
 *
 *   CONFIRM_WRITE=1 npx tsx scripts/fix-flow-stuck-outcomes.ts
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

loadEnvFile(join(process.cwd(), "..", "elio-deploy-env", "shell.env"), true);
loadEnvFile(join(process.cwd(), "packages", "db", ".env"));
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

const WRITE = process.env.CONFIRM_WRITE === "1";
const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";
const REASONS = ["FAILED_FINANCE", "PRICE_SHOPPING", "BAD_EXPERIENCE", "OUT_OF_BUDGET"] as const;

async function main() {
  const { prisma } = await import("@elio/db");
  const bad = await prisma.consult.findMany({
    where: {
      practiceId: PRACTICE_ID,
      outcome: "DECLINED",
      stuckReason: { in: [...REASONS] },
    },
    select: { id: true, stuckReason: true },
  });
  console.log(`DECLINED+stuckReason rows to fix: ${bad.length}`);
  for (const r of REASONS) {
    console.log(`  ${r}: ${bad.filter((b) => b.stuckReason === r).length}`);
  }
  if (WRITE && bad.length) {
    const result = await prisma.consult.updateMany({
      where: {
        practiceId: PRACTICE_ID,
        outcome: "DECLINED",
        stuckReason: { in: [...REASONS] },
      },
      data: { outcome: "THINKING" },
    });
    console.log(`updated ${result.count}`);
  } else if (!WRITE) {
    console.log("dry-run — set CONFIRM_WRITE=1 to apply");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
