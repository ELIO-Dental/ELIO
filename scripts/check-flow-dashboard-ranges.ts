/**
 * One-shot: dashboard all-time vs 3-month vs legacy Sheet export.
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

async function main() {
  const { prisma } = await import("@elio/db");
  const { getFlowDashboard } = await import("../apps/flow/lib/flow-service");
  const { compareFlowDashboardParity, parseLegacyFlowExportFile } = await import(
    "../apps/flow/lib/flow-parity"
  );

  const practiceId = process.env.PRACTICE_ID?.trim() || "seed-practice";
  const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
  const all = await getFlowDashboard(practiceId);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setMonth(from.getMonth() - 3);
  from.setHours(0, 0, 0, 0);
  const three = await getFlowDashboard(practiceId, { from, to });
  const legacyFile = parseLegacyFlowExportFile(
    readFileSync(join(process.cwd(), "parity-exports", "legacy-flow-stats.json"), "utf8")
  );
  const legacy = legacyFile.stats;

  console.log(
    JSON.stringify(
      {
        practice: { id: practiceId, name: practice?.name },
        allTime: all.stats,
        threeMonth: three.stats,
        legacy,
        allTimeParity: compareFlowDashboardParity(legacy, all.stats),
        threeMonthParity: compareFlowDashboardParity(legacy, three.stats),
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
