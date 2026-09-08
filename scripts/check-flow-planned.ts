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

async function main() {
  const { prisma } = await import("@elio/db");
  const { getFlowDashboard } = await import("../apps/flow/lib/flow-service");
  const all = await getFlowDashboard("seed-practice");
  let sumOverrideElseQuote = 0;
  let sumQuoteOnly = 0;
  const consults = await prisma.consult.findMany({
    where: { practiceId: "seed-practice" },
    select: { quotePence: true, quotePenceOverride: true },
  });
  for (const c of consults) {
    sumOverrideElseQuote += c.quotePenceOverride ?? c.quotePence ?? 0;
    sumQuoteOnly += c.quotePence ?? 0;
  }
  console.log(
    JSON.stringify(
      {
        dashboardPlannedPence: all.stats.totalPlannedPence,
        dashboardPlannedGBP: Math.round(all.stats.totalPlannedPence / 100),
        sumOverrideElseQuoteGBP: Math.round(sumOverrideElseQuote / 100),
        sumQuoteOnlyGBP: Math.round(sumQuoteOnly / 100),
        legacyPlannedGBP: 4263121,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
