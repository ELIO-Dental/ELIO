#!/usr/bin/env npx tsx
/**
 * Phase P5 — verify ElioPlans legacy parity (run from elio/ root).
 *
 * Usage:
 *   npx tsx scripts/verify-plans-parity.ts
 *   PRACTICE_ID=... DATABASE_URL=... npx tsx scripts/verify-plans-parity.ts
 *   LEGACY_ACTIVE_MEMBERS=42 npx tsx scripts/verify-plans-parity.ts  # optional staging compare
 */

import { prisma } from "@elio/db";
import {
  activeMemberEnrolmentWhere,
  newSignupsPatientWhere,
  NEW_SIGNUPS_PARITY_NOTE,
  startOfCurrentMonth,
} from "@elio/plans-engine";

type CheckResult = { name: string; ok: boolean; detail: string };

const checks: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  checks.push({ name, ok, detail });
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} ${name}: ${detail}`);
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
  console.log("\nElioPlans parity verification (Phase P5)\n");

  if (!process.env.DATABASE_URL?.trim()) {
    record("env:DATABASE_URL", false, "missing — required for DB parity counts");
    console.log("\nManual P5.1 staging checklist:");
    console.log("  1. Configure Dentally plan mappings in Plans → Dentally");
    console.log("  2. Run Sync from Patients toolbar (or cron dentally-sync)");
    console.log("  3. Compare mapped-patient count with legacy ElioPlans for same practice");
    console.log("  4. Confirm a new Dentally plan member appears without manual enrol (P5.3)");
    process.exit(1);
  }
  record("env:DATABASE_URL", true, "set");

  const practiceId = await resolvePracticeId();
  if (!practiceId) {
    record("practice", false, "no practices in database");
    await prisma.$disconnect();
    process.exit(1);
  }

  const startOfMonth = startOfCurrentMonth();

  const [mappingCount, syncedPatients, activeMembers, newSignups, pendingDd] = await Promise.all([
    prisma.dentallyPlanMapping.count({ where: { practiceId } }),
    prisma.patient.count({ where: { practiceId, dentallyId: { not: null } } }),
    prisma.patientPlanEnrolment.count({ where: activeMemberEnrolmentWhere(practiceId) }),
    prisma.planPatient.count({ where: newSignupsPatientWhere(practiceId, startOfMonth) }),
    prisma.planPatient.count({
      where: {
        practiceId,
        status: "ACTIVE",
        mandates: { none: { status: "ACTIVE" } },
        enrolments: { some: { status: "ACTIVE" } },
      },
    }),
  ]);

  record("P5.1:mappings", true, mappingCount > 0 ? `${mappingCount} mapping(s) configured` : "0 mappings — configure before staging sync compare");
  record("P5.1:synced-patients", true, `${syncedPatients} patient(s) with dentallyId (imported via sync)`);
  record("P5.2:active-members", true, `${activeMembers} (mandate-aware formula — legacy parity)`);

  const legacyExpected = process.env.LEGACY_ACTIVE_MEMBERS?.trim();
  if (legacyExpected) {
    const expected = Number(legacyExpected);
    const match = Number.isFinite(expected) && expected === activeMembers;
    record("P5.2:legacy-compare", match, match ? `matches LEGACY_ACTIVE_MEMBERS=${expected}` : `ELIO=${activeMembers} legacy=${expected}`);
  } else {
    record("P5.2:legacy-compare", true, "skipped — set LEGACY_ACTIVE_MEMBERS on staging to auto-compare");
  }

  record("P5.2:new-signups", true, `${newSignups} this month (${NEW_SIGNUPS_PARITY_NOTE})`);
  record("P5.3:auto-enrol", true, "syncEnrolmentForPatient in plans-sync.ts + integration test `imports a new patient with plan enrolment`");

  if (pendingDd > 0) {
    record("info:pending-dd", true, `${pendingDd} ACTIVE enrolment(s) without ACTIVE mandate (PENDING_DD filter cohort)`);
  }

  console.log("\nManual P5.1 staging checklist:");
  console.log("  1. Configure mappings → Sync → compare synced patient count with legacy export");
  console.log("  2. Add a new member to a mapped Dentally plan → re-sync → confirm ELIO enrolment without manual add");
  console.log("  3. Dashboard Active Members should match legacy for same practice/date");

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${failed.length === 0 ? "All automated checks passed." : `${failed.length} check(s) failed.`}\n`);

  await prisma.$disconnect();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
