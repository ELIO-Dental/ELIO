#!/usr/bin/env npx tsx
/**
 * Phase Y4.2 — verify Elio Pay net pay matches legacy AuraPay export (±£1).
 *
 * Usage:
 *   PAY_PERIOD_ID=... LEGACY_PAY_EXPORT_PATH=./legacy-period.json npx tsx scripts/verify-pay-parity.ts
 *   PRACTICE_ID=... DATABASE_URL=... npx tsx scripts/verify-pay-parity.ts
 *
 * Legacy export format:
 *   { "period": "2026-03", "entries": [{ "dentistName": "Dr A", "netPayPounds": 5234.56 }] }
 */

import { readFileSync } from "node:fs";
import { prisma, scopedDb } from "@elio/db";
import {
  comparePeriodPayParity,
  DEFAULT_PAY_PARITY_TOLERANCE_PENCE,
  parseLegacyPayExportFile,
} from "../apps/pay/lib/pay-period-parity";

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
  console.log("\nElio Pay parity verification (Phase Y4.2)\n");

  if (!process.env.DATABASE_URL?.trim()) {
    record("env:DATABASE_URL", false, "missing — required for pay period compare");
    process.exit(1);
  }
  record("env:DATABASE_URL", true, "set");

  const practiceId = await resolvePracticeId();
  if (!practiceId) {
    record("practice", false, "no practices in database");
    await prisma.$disconnect();
    process.exit(1);
  }

  const exportPath = process.env.LEGACY_PAY_EXPORT_PATH?.trim();
  if (!exportPath) {
    record("env:LEGACY_PAY_EXPORT_PATH", false, "missing — export one period from legacy AuraPay as JSON");
    console.log("\nManual Y4.2 staging checklist:");
    console.log("  1. In legacy AuraPay: fetch Dentally + calculate for one pay period");
    console.log("  2. Export each dentist net pay to legacy-period.json (see script header for format)");
    console.log("  3. In new Elio Pay: fetch + calculate the same period");
    console.log("  4. Re-run with PAY_PERIOD_ID and LEGACY_PAY_EXPORT_PATH");
    await prisma.$disconnect();
    process.exit(1);
  }

  const raw = readFileSync(exportPath, "utf8");
  const legacyExport = parseLegacyPayExportFile(raw);
  record("legacy-export", true, `${legacyExport.entries.length} dentist(s) in ${exportPath}`);

  const payPeriodId = process.env.PAY_PERIOD_ID?.trim();
  const db = scopedDb(practiceId);
  const payPeriod = payPeriodId
    ? await db.payPeriod.findUnique({
        where: { id: payPeriodId },
        include: { payslipEntries: { include: { dentist: true } } },
      })
    : await db.payPeriod.findFirst({
        where: { payslipEntries: { some: {} } },
        orderBy: { periodStart: "desc" },
        include: { payslipEntries: { include: { dentist: true } } },
      });

  if (!payPeriod) {
    record("pay-period", false, "no pay period with payslips found — set PAY_PERIOD_ID");
    await prisma.$disconnect();
    process.exit(1);
  }

  record(
    "pay-period",
    true,
    `${payPeriod.periodStart.toISOString().slice(0, 10)} – ${payPeriod.periodEnd.toISOString().slice(0, 10)} (${payPeriod.id})`
  );

  const tolerance = Number(process.env.PAY_PARITY_TOLERANCE_PENCE ?? DEFAULT_PAY_PARITY_TOLERANCE_PENCE);
  const result = comparePeriodPayParity(
    legacyExport.entries,
    payPeriod.payslipEntries.map((entry) => ({
      dentistName: entry.dentist.name,
      finalPayPence: entry.finalPayPence,
    })),
    Number.isFinite(tolerance) ? tolerance : DEFAULT_PAY_PARITY_TOLERANCE_PENCE
  );

  for (const entry of result.matched) {
    record(
      `compare:${entry.dentistName}`,
      entry.withinTolerance,
      `legacy ${(entry.legacyNetPayPence / 100).toFixed(2)} vs new ${(entry.newFinalPayPence / 100).toFixed(2)} (diff ${(entry.diffPence / 100).toFixed(2)})`
    );
  }

  if (result.missingInNew.length > 0) {
    record("missing-in-new", false, result.missingInNew.join(", "));
  } else {
    record("missing-in-new", true, "none");
  }

  if (result.missingInLegacy.length > 0) {
    record("missing-in-legacy", false, result.missingInLegacy.join(", "));
  } else {
    record("missing-in-legacy", true, "none");
  }

  record("Y4.2:period-parity", result.ok, result.ok ? `all dentists within ±£${tolerance / 100}` : "one or more mismatches");

  await prisma.$disconnect();
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
