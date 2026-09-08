/**
 * Benchmark getFlowDashboard latency + assert live KPI parity.
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

  // Warm + measure
  await getFlowDashboard(practiceId);
  const runs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const dash = await getFlowDashboard(practiceId);
    runs.push(Date.now() - t0);
    if (i === 2) {
      const legacy = parseLegacyFlowExportFile(
        readFileSync(join(process.cwd(), "parity-exports", "legacy-flow-stats.json"), "utf8")
      );
      const current = {
        totalConsultations: dash.stats.totalConsultations,
        attended: dash.stats.attended,
        converted: dash.stats.converted,
        stuck: dash.stats.stuck,
        totalPipelineValuePence: dash.stats.totalPipelineValuePence,
        totalPlannedPence: dash.stats.totalPlannedPence,
        totalPaidPence: dash.stats.totalPaidPence,
        planSignUps: dash.stats.planSignUps,
        conversionRate: dash.stats.conversionRate,
      };
      const cmp = compareFlowDashboardParity(legacy.stats, current);
      console.log(
        JSON.stringify(
          {
            practiceId,
            ms: { runs, avg: Math.round(runs.reduce((a, b) => a + b, 0) / runs.length) },
            live: {
              consultations: current.totalConsultations,
              plannedGBP: Math.round(current.totalPlannedPence / 100),
              paidGBP: Math.round(current.totalPaidPence / 100),
              conversionRate: current.conversionRate,
              rows: dash.rows.length,
            },
            ok: cmp.ok,
            diffs: cmp.diffs,
          },
          null,
          2
        )
      );
      await prisma.$disconnect();
      process.exit(cmp.ok ? 0 : 1);
    }
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
