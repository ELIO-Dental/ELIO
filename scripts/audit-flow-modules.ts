/**
 * Module-by-module Flow spot-checks after KPI audit passes.
 * Nav matches classic ElioFlow: Dashboard + Settings (Portal owns Team).
 *
 * Usage (from elio/):
 *   npx tsx scripts/audit-flow-modules.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

type Finding = { severity: "PASS" | "WARN" | "FAIL"; module: string; check: string; detail: string };
const findings: Finding[] = [];

function record(severity: Finding["severity"], module: string, check: string, detail: string) {
  findings.push({ severity, module, check, detail });
  const icon = severity === "PASS" ? "✓" : severity === "WARN" ? "⚠" : "✗";
  console.log(`${icon} [${module}] ${check}: ${detail}`);
}

async function main() {
  const { prisma } = await import("@elio/db");
  const { getFlowDashboard } = await import("../apps/flow/lib/flow-service");
  const { getFlowSettings } = await import("@elio/dentally");
  const { parseLegacyFlowExportFile, compareFlowDashboardParity } = await import(
    "../apps/flow/lib/flow-parity"
  );
  const practiceId = process.env.PRACTICE_ID?.trim() || "seed-practice";

  console.log(`\n=== Elio Flow module audit ===\npractice=${practiceId}\n`);

  const { stats: allTime } = await getFlowDashboard(practiceId);
  const legacy = parseLegacyFlowExportFile(
    readFileSync(join(process.cwd(), "parity-exports", "legacy-flow-stats.json"), "utf8")
  ).stats;
  const parity = compareFlowDashboardParity(legacy, allTime);
  if (parity.ok) {
    record(
      "PASS",
      "dashboard",
      "all-time-vs-legacy",
      `consults=${allTime.totalConsultations} converted=${allTime.converted} rate=${allTime.conversionRate}%`
    );
  } else {
    record("FAIL", "dashboard", "all-time-vs-legacy", JSON.stringify(parity.diffs));
  }

  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setMonth(from.getMonth() - 3);
  from.setHours(0, 0, 0, 0);
  const { stats: threeMonth } = await getFlowDashboard(practiceId, { from, to });
  if (threeMonth.totalConsultations > 0 && threeMonth.totalConsultations < allTime.totalConsultations) {
    record(
      "PASS",
      "dashboard",
      "3-month-filter",
      `consults=${threeMonth.totalConsultations} (all-time ${allTime.totalConsultations}) — uses enquiry.capturedAt`
    );
  } else {
    record(
      "FAIL",
      "dashboard",
      "3-month-filter",
      `3m=${threeMonth.totalConsultations} all=${allTime.totalConsultations}`
    );
  }

  const settings = await getFlowSettings(practiceId);
  if (settings && typeof settings.paidConversionThresholdPence === "number") {
    record(
      "PASS",
      "settings",
      "loaded",
      `paidConversionThresholdPence=${settings.paidConversionThresholdPence}`
    );
  } else {
    record("FAIL", "settings", "loaded", "missing flow settings");
  }

  const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
  if (practice?.name) {
    record("PASS", "tenant", "practice", `"${practice.name}" (${practiceId})`);
  } else {
    record("FAIL", "tenant", "practice", "missing");
  }

  const practices = await prisma.practice.findMany({
    select: { id: true, name: true, _count: { select: { consults: true } } },
  });
  const otherWithConsults = practices.filter((p) => p.id !== practiceId && p._count.consults > 0);
  if (otherWithConsults.length === 0) {
    record("PASS", "tenant", "isolation", "no other practice has Flow consults leaked");
  } else {
    record("FAIL", "tenant", "isolation", JSON.stringify(otherWithConsults));
  }

  const junkPatients = await prisma.patient.count({
    where: {
      practiceId,
      OR: [
        { firstName: { contains: "e2e", mode: "insensitive" } },
        { lastName: { contains: "sandbox", mode: "insensitive" } },
        { email: { contains: "e2e@", mode: "insensitive" } },
      ],
    },
  });
  if (junkPatients === 0) {
    record("PASS", "contamination", "test-patients", "none");
  } else {
    record("FAIL", "contamination", "test-patients", String(junkPatients));
  }

  const pass = findings.filter((f) => f.severity === "PASS").length;
  const warn = findings.filter((f) => f.severity === "WARN").length;
  const fail = findings.filter((f) => f.severity === "FAIL").length;
  console.log(`\n=== Summary: PASS ${pass}  WARN ${warn}  FAIL ${fail} ===\n`);

  const outDir = join(process.cwd(), "parity-exports");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "flow-modules-audit.json"),
    JSON.stringify({ practiceId, auditedAt: new Date().toISOString(), summary: { pass, warn, fail }, findings }, null, 2)
  );

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
  console.log("MODULE SPOT-CHECKS PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
