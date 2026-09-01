#!/usr/bin/env npx tsx
/**
 * Phase F4.1 — verify Elio Flow dashboard stats match legacy ElioFlow pipeline export.
 *
 * Usage:
 *   PRACTICE_ID=... LEGACY_FLOW_EXPORT_PATH=./legacy-flow-stats.json npx tsx scripts/verify-flow-parity.ts
 *
 * Legacy export format (from ElioFlow GET /api/pipeline `stats` object):
 *   { "stats": { "totalConsultations": 10, "attended": 8, "converted": 3, "stuck": 4,
 *     "totalPipelineValue": 12000, "totalPlanned": 45000, "totalPaid": 8000,
 *     "elioCareCount": 2, "conversionRate": 38 } }
 */

import { readFileSync } from "node:fs";
import { prisma } from "@elio/db";
import { getFlowDashboard } from "../apps/flow/lib/flow-service";
import { compareFlowDashboardParity, parseLegacyFlowExportFile } from "../apps/flow/lib/flow-parity";

type CheckResult = { name: string; ok: boolean; detail: string };
const checks: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}: ${detail}`);
}

async function resolvePracticeId(): Promise<string | null> {
  const fromEnv = process.env.PRACTICE_ID?.trim();
  if (fromEnv) return fromEnv;
  const first = await prisma.practice.findFirst({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (!first) return null;
  record("practice", true, `using first practice "${first.name}" (${first.id}) — set PRACTICE_ID to override`);
  return first.id;
}

async function main() {
  console.log("\nElio Flow parity verification (Phase F4.1)\n");

  if (!process.env.DATABASE_URL?.trim()) {
    record("env:DATABASE_URL", false, "missing — required for dashboard compare");
    process.exit(1);
  }
  record("env:DATABASE_URL", true, "set");

  const practiceId = await resolvePracticeId();
  if (!practiceId) {
    record("practice", false, "no practices in database");
    await prisma.$disconnect();
    process.exit(1);
  }

  const exportPath = process.env.LEGACY_FLOW_EXPORT_PATH?.trim();
  if (!exportPath) {
    record("env:LEGACY_FLOW_EXPORT_PATH", false, "missing — export stats from legacy ElioFlow pipeline API");
    console.log("\nManual F4.1 staging checklist:");
    console.log("  1. In legacy ElioFlow: open dashboard with same date/dentist filters as new app");
    console.log("  2. Copy the `stats` object from GET /api/pipeline into legacy-flow-stats.json");
    console.log("  3. Re-run with PRACTICE_ID and LEGACY_FLOW_EXPORT_PATH");
    await prisma.$disconnect();
    process.exit(1);
  }

  const legacy = parseLegacyFlowExportFile(readFileSync(exportPath, "utf8"));
  record("legacy-export", true, `loaded stats from ${exportPath}`);

  const dashboard = await getFlowDashboard(practiceId);
  const result = compareFlowDashboardParity(legacy.stats, dashboard.stats);

  if (result.ok) {
    record("dashboard-stats", true, "all stat cards match legacy export (±£1 on money fields)");
  } else {
    for (const diff of result.diffs) {
      record(
        `stat:${diff.field}`,
        false,
        `legacy=${diff.legacy} current=${diff.current} (delta ${diff.delta})`
      );
    }
  }

  await prisma.$disconnect();
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${failed === 0 ? "PASS" : "FAIL"} — ${checks.length - failed}/${checks.length} checks passed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
