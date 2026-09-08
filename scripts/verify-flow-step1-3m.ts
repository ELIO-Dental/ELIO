/**
 * Step1 verify: Last-3-months dashboard cards vs old live screenshot.
 * Old (Last 3 Months): 87 / 87 / 42 / 45 / £741,390 / £125,075 / AuraCare 0 / 48%
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

  const range = flowDatePresetRange("3m");
  const from = parseLocalDateStart(range.from!);
  const to = parseLocalDateEnd(range.to!);
  const dash = await getFlowDashboard("seed-practice", { from, to });
  const s = dash.stats;

  const old = {
    totalConsultations: 87,
    attended: 87,
    converted: 42,
    stuck: 45,
    totalPlanned: 741390,
    totalPaid: 125075,
    planSignUps: 0,
    conversionRate: 48,
  };

  const live = {
    totalConsultations: s.totalConsultations,
    attended: s.attended,
    converted: s.converted,
    stuck: s.stuck,
    totalPlanned: Math.round(s.totalPlannedPence / 100),
    totalPaid: Math.round(s.totalPaidPence / 100),
    planSignUps: s.planSignUps,
    conversionRate: s.conversionRate,
  };

  const diffs = (Object.keys(old) as (keyof typeof old)[])
    .filter((k) => old[k] !== live[k])
    .map((k) => ({ field: k, old: old[k], live: live[k], delta: live[k] - old[k] }));

  console.log(
    JSON.stringify(
      {
        range,
        from: from.toISOString(),
        to: to.toISOString(),
        live,
        oldScreenshot: old,
        countMatch: live.totalConsultations === old.totalConsultations,
        diffs,
        topRows: dash.rows.slice(0, 5).map((r) => ({
          name: r.patientName,
          date: r.consultationDate,
          plan: r.planValuePence / 100,
          paid: r.totalPaidPence / 100,
          status: r.statusLabel,
          days: r.daysSinceConsult,
        })),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  // Step1 success = consultation count matches (period alignment)
  process.exit(live.totalConsultations === old.totalConsultations ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
