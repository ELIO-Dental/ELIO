/**
 * Remaining work runner — READ-ONLY where possible.
 * - Pull legacy DentallyPlanMapping from old unmapped table if present
 * - Export live ELIO Flow stats + Pay period for parity baseline
 * - Seed mappings into new table ONLY if empty and legacy rows exist (idempotent upsert)
 *
 * Usage:
 *   DATABASE_URL=... PRACTICE_ID=seed-practice npx tsx scripts/run-remaining-parity-prep.ts
 *   DATABASE_URL=... PRACTICE_ID=seed-practice npx tsx scripts/run-remaining-parity-prep.ts --apply-mappings
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@elio/db";
import { getFlowDashboard } from "../apps/flow/lib/flow-service";
import { activeMemberEnrolmentWhere } from "@elio/plans-engine";

const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";
const APPLY = process.argv.includes("--apply-mappings");
const OUT = join(process.cwd(), "parity-exports");

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    name
  );
  return Boolean(rows[0]?.exists);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`\nParity prep — practice=${PRACTICE_ID} applyMappings=${APPLY}\n`);

  const practice = await prisma.practice.findUnique({ where: { id: PRACTICE_ID } });
  if (!practice) {
    console.error("Practice not found");
    process.exit(1);
  }

  // --- Flow: export CURRENT stats as baseline (for compare when legacy arrives) ---
  const dash = await getFlowDashboard(PRACTICE_ID);
  const flowExport = {
    source: "elio-live",
    practiceId: PRACTICE_ID,
    exportedAt: new Date().toISOString(),
    stats: {
      totalConsultations: dash.stats.totalConsultations,
      attended: dash.stats.attended,
      converted: dash.stats.converted,
      stuck: dash.stats.stuck,
      totalPipelineValue: Math.round(dash.stats.totalPlannedPence / 100),
      totalPlanned: Math.round(dash.stats.totalPlannedPence / 100),
      totalPaid: Math.round(dash.stats.totalPaidPence / 100),
      elioCareCount: dash.stats.planSignUps,
      conversionRate: dash.stats.conversionRate,
    },
  };
  writeFileSync(join(OUT, "elio-flow-stats.json"), JSON.stringify(flowExport, null, 2));
  console.log("✓ wrote parity-exports/elio-flow-stats.json");

  // Self-compare (sanity): ELIO vs itself should PASS
  const { compareFlowDashboardParity } = await import("../apps/flow/lib/flow-parity");
  const self = compareFlowDashboardParity(flowExport.stats, dash.stats);
  console.log(self.ok ? "✓ Flow self-parity PASS" : `✗ Flow self-parity FAIL ${JSON.stringify(self.diffs)}`);

  // --- Plans: active members ---
  const activeMembers = await prisma.patientPlanEnrolment.count({
    where: activeMemberEnrolmentWhere(PRACTICE_ID),
  });
  writeFileSync(
    join(OUT, "elio-plans-active-members.json"),
    JSON.stringify({ practiceId: PRACTICE_ID, activeMembers, exportedAt: new Date().toISOString() }, null, 2)
  );
  console.log(`✓ Plans active members = ${activeMembers}`);

  // --- Legacy DentallyPlanMapping table (old ElioPlans, unmapped name) ---
  const hasOldMappings = await tableExists("DentallyPlanMapping");
  const hasOldAlt = await tableExists("dentally_plan_mappings"); // unlikely
  console.log(`Legacy table DentallyPlanMapping exists: ${hasOldMappings}`);

  let legacyMappings: {
    id: string;
    dentallyPlanCode: string;
    dentallyPlanName: string | null;
    planId: string | null;
    active: boolean;
  }[] = [];

  if (hasOldMappings) {
    legacyMappings = await prisma.$queryRawUnsafe(
      `SELECT id, "dentallyPlanCode", "dentallyPlanName", "planId", active FROM "DentallyPlanMapping"`
    );
    writeFileSync(join(OUT, "legacy-dentally-mappings.json"), JSON.stringify(legacyMappings, null, 2));
    console.log(`✓ found ${legacyMappings.length} legacy DentallyPlanMapping row(s)`);
  }

  const planModels = await prisma.planModel.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { id: true, name: true, active: true },
  });
  writeFileSync(join(OUT, "elio-plan-models.json"), JSON.stringify(planModels, null, 2));
  console.log(`✓ ${planModels.length} PlanModel(s) on practice`);

  const existingMaps = await prisma.dentallyPlanMapping.count({ where: { practiceId: PRACTICE_ID } });
  console.log(`Current new mappings: ${existingMaps}`);

  if (APPLY && existingMaps === 0 && legacyMappings.length > 0 && planModels.length > 0) {
    // Map old planId → new PlanModel by name if we can; else first active plan by fuzzy name match
    let created = 0;
    for (const m of legacyMappings) {
      if (!m.active) continue;
      const name = (m.dentallyPlanName || m.dentallyPlanCode || "").trim();
      if (!name) continue;
      const match =
        planModels.find((p) => p.name.toLowerCase() === name.toLowerCase()) ||
        planModels.find((p) => name.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(name.toLowerCase()));
      if (!match) {
        console.log(`  skip mapping "${name}" — no PlanModel match`);
        continue;
      }
      await prisma.dentallyPlanMapping.upsert({
        where: {
          practiceId_dentallyPlanName: { practiceId: PRACTICE_ID, dentallyPlanName: name },
        },
        create: {
          practiceId: PRACTICE_ID,
          dentallyPlanName: name,
          planModelId: match.id,
        },
        update: { planModelId: match.id },
      });
      created++;
      console.log(`  upserted mapping "${name}" → ${match.name}`);
    }
    console.log(`✓ applied ${created} mapping(s)`);
  } else if (APPLY && existingMaps > 0) {
    console.log("⏭ skip apply — mappings already exist (no duplicates)");
  } else if (APPLY && legacyMappings.length === 0) {
    console.log("⏭ skip apply — no legacy mapping rows; configure in Plans → Dentally UI");
  }

  // --- Pay: export existing period net pays (for later legacy compare) ---
  const period = await prisma.payPeriod.findFirst({
    where: { practiceId: PRACTICE_ID, payslipEntries: { some: {} } },
    orderBy: [{ periodStart: "desc" }, { updatedAt: "desc" }],
    include: {
      payslipEntries: { include: { dentist: { select: { name: true } } } },
    },
  });

  if (period) {
    const payExport = {
      period: period.periodStart.toISOString().slice(0, 7),
      payPeriodId: period.id,
      status: period.status,
      entries: period.payslipEntries.map((e) => ({
        dentistName: e.dentist.name,
        netPayPounds: Math.round(e.finalPayPence) / 100,
        finalPayPence: e.finalPayPence,
      })),
    };
    writeFileSync(join(OUT, "elio-pay-period.json"), JSON.stringify(payExport, null, 2));
    console.log(`✓ wrote parity-exports/elio-pay-period.json (${payExport.entries.length} dentists, id=${period.id})`);
  } else {
    console.log("⚠ no pay period with payslips");
  }

  // --- CRON_SECRET note from sample envs ---
  console.log("\n── CRON_SECRET note ──");
  console.log("shell sample and plans sample use DIFFERENT CRON_SECRET values (correct — per Vercel project).");
  console.log("Verify on Vercel that each project has its own secret matching that project's crons.");
  console.log("GoCardless: client confirmed LIVE on Vercel (sample plans.env may still show sandbox — update sample).");

  console.log("\nDone. Next: obtain legacy Flow stats / legacy Active Members / legacy Pay export to compare.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
