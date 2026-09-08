/**
 * Verify default Last-3-months path matches classic ElioFlow card counts.
 * Old screenshot: 87 / 87 / 42 / 45 / AuraCare 0 / 48%
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
  const { flowDatePresetRange, parseLocalDateEnd, parseLocalDateStart } = await import(
    "../apps/flow/lib/flow-date-range"
  );

  // Same helper the dashboard page uses for SSR default.
  const range = flowDatePresetRange("3m");
  const dash = await getFlowDashboard("seed-practice", {
    from: parseLocalDateStart(range.from!),
    to: parseLocalDateEnd(range.to!),
  });

  const expected = {
    totalConsultations: 87,
    attended: 87,
    converted: 42,
    stuck: 45,
    planSignUps: 0,
    conversionRate: 48,
  };

  const live = {
    totalConsultations: dash.stats.totalConsultations,
    attended: dash.stats.attended,
    converted: dash.stats.converted,
    stuck: dash.stats.stuck,
    planSignUps: dash.stats.planSignUps,
    conversionRate: dash.stats.conversionRate,
  };

  const countDiffs = (Object.keys(expected) as (keyof typeof expected)[]).filter(
    (k) => expected[k] !== live[k]
  );

  // All-time still available via empty range
  const allTime = await getFlowDashboard("seed-practice", {});

  console.log(
    JSON.stringify(
      {
        defaultPreset: "3m",
        range,
        live,
        expected,
        countParityOk: countDiffs.length === 0,
        countDiffs,
        allTimeStillWorks: allTime.stats.totalConsultations === 819,
        allTimeConsultations: allTime.stats.totalConsultations,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  process.exit(countDiffs.length === 0 && allTime.stats.totalConsultations === 819 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
