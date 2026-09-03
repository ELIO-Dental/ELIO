#!/usr/bin/env npx tsx
/**
 * Quick staging snapshot for P12.8–P12.10 — no legacy export required.
 * Run: DATABASE_URL=... npx tsx scripts/staging-parity-snapshot.ts
 */

import { prisma, scopedDb } from "@elio/db";
import { getFlowDashboard } from "../apps/flow/lib/flow-service";
import {
  activeMemberEnrolmentWhere,
  startOfCurrentMonth,
  newSignupsPatientWhere,
} from "@elio/plans-engine";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const practiceId = process.env.PRACTICE_ID?.trim()
    ?? (await prisma.practice.findFirst({ orderBy: { name: "asc" }, select: { id: true, name: true } }))?.id;

  if (!practiceId) {
    console.error("No practice found");
    process.exit(1);
  }

  const practices = await prisma.practice.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      _count: { select: { patients: true, consults: true, payPeriods: true } },
    },
  });

  console.log("── Practices on staging DB ──");
  for (const p of practices) {
    const marker = p.id === practiceId ? "→" : " ";
    console.log(
      `${marker} ${p.name}: patients=${p._count.patients} consults=${p._count.consults} payPeriods=${p._count.payPeriods} (${p.id})`
    );
  }
  console.log();

  const practice = practices.find((p) => p.id === practiceId);
  console.log(`\nStaging parity snapshot — ${practice?.name} (${practiceId})\n`);

  const [syncRuns, mappings, patients, consults] = await Promise.all([
    prisma.dentallySyncRun.findMany({
      where: { practiceId },
      orderBy: { startedAt: "desc" },
      take: 3,
      select: { status: true, startedAt: true, finishedAt: true, errorMessage: true },
    }),
    prisma.dentallyPlanMapping.count({ where: { practiceId } }),
    prisma.patient.count({ where: { practiceId } }),
    prisma.consult.count({ where: { practiceId } }),
  ]);

  console.log("── Dentally sync (last 3 runs) ──");
  if (syncRuns.length === 0) {
    console.log("  (no sync runs — run Portal → Integrations → Sync now)");
  } else {
    for (const run of syncRuns) {
      console.log(
        `  ${run.startedAt.toISOString()} ${run.status}${run.errorMessage ? ` — ${run.errorMessage}` : ""}`
      );
    }
  }

  console.log("\n── Flow (P12.8) ──");
  console.log(`  Consults in DB: ${consults}`);
  if (consults > 0) {
    const dash = await getFlowDashboard(practiceId);
    console.log("  Dashboard stats:", JSON.stringify(dash.stats, null, 2));
    console.log("  → Compare with legacy ElioFlow pipeline stats (export to legacy-flow-stats.json)");
  } else {
    console.log("  ⚠ No consults — run sync + Flow cosmetic import first");
  }

  console.log("\n── Plans (P12.9) ──");
  const startOfMonth = startOfCurrentMonth();
  const [activeMembers, newSignups, pendingDd] = await Promise.all([
    prisma.patientPlanEnrolment.count({ where: activeMemberEnrolmentWhere(practiceId) }),
    prisma.planPatient.count({ where: newSignupsPatientWhere(practiceId, startOfMonth) }),
    prisma.planPatient.count({
      where: {
        practiceId,
        status: "ACTIVE",
        mandates: { none: { status: "ACTIVE" } },
        patientPlans: { some: { status: "ACTIVE" } },
      },
    }),
  ]);
  console.log(`  Plan mappings: ${mappings}`);
  console.log(`  Synced patients: ${patients}`);
  console.log(`  Active members (mandate-aware): ${activeMembers}`);
  console.log(`  New signups this month: ${newSignups}`);
  console.log(`  PENDING_DD cohort: ${pendingDd}`);
  console.log("  → Set LEGACY_ACTIVE_MEMBERS=<legacy count> and re-run verify:plans-parity");

  console.log("\n── Pay (P12.10) ──");
  const db = scopedDb(practiceId);
  const periods = await db.payPeriod.findMany({
    orderBy: { periodStart: "desc" },
    take: 5,
    select: {
      id: true,
      periodStart: true,
      periodEnd: true,
      status: true,
      _count: { select: { payslipEntries: true } },
    },
  });
  if (periods.length === 0) {
    console.log("  ⚠ No pay periods — create one in Pay and fetch from Dentally");
  } else {
    for (const p of periods) {
      console.log(
        `  ${p.periodStart.toISOString().slice(0, 10)} – ${p.periodEnd.toISOString().slice(0, 10)} | ${p.status} | ${p._count.payslipEntries} payslip(s) | id=${p.id}`
      );
    }
    console.log("  → Export legacy period net pays to JSON and run verify:pay-parity with PAY_PERIOD_ID");
  }

  console.log("\n── Staging URLs ──");
  console.log("  Shell:  https://app.elioportal.co.uk/settings/integrations");
  console.log("  Flow:   https://flow.elioportal.co.uk/dashboard");
  console.log("  Plans:  https://plans.elioportal.co.uk/dashboard");
  console.log("  Pay:    https://pay.elioportal.co.uk\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
