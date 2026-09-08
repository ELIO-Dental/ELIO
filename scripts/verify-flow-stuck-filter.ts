/**
 * Verify dashboard stuck filter matches legacy/stats (attended && !converted).
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
  const { getFlowDashboard } = await import("../apps/flow/lib/flow-service");
  const { compareFlowDashboardParity, parseLegacyFlowExportFile } = await import(
    "../apps/flow/lib/flow-parity"
  );
  const practiceId = "seed-practice";
  const { stats, rows } = await getFlowDashboard(practiceId);
  const stuckRows = rows.filter(
    (r) => r.attended && r.statusKey !== "converted" && r.statusKey !== "completed"
  );
  const legacy = parseLegacyFlowExportFile(
    readFileSync(join(process.cwd(), "parity-exports", "legacy-flow-stats.json"), "utf8")
  ).stats;
  const parity = compareFlowDashboardParity(legacy, stats);
  const out = {
    statsStuck: stats.stuck,
    filterStuck: stuckRows.length,
    match: stats.stuck === stuckRows.length,
    parity,
  };
  console.log(JSON.stringify(out, null, 2));
  if (!out.match || !parity.ok) process.exit(1);
  console.log("STUCK FILTER + KPI PARITY OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
