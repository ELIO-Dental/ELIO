/**
 * Fill remaining ElioPlans â†’ ELIO Plans data gaps (same Neon DB).
 * Table-by-table, idempotent. Dry-run by default.
 *
 *   npx tsx scripts/fill-plans-legacy-gaps.ts
 *   CONFIRM_WRITE=1 npx tsx scripts/fill-plans-legacy-gaps.ts
 *
 * Covers gaps not in migrate-elioplans.ts:
 *   Setting â†’ PlanPracticeSetting
 *   PatientNote â†’ PlanPatientNote
 *   DentallyPlanMapping â†’ DentallyPlanMapping (plans_*)
 *   RedeemRule â†’ PlanRedeemRule
 *   Redeem â†’ PlanRedeem
 *   Mandate bank fields â†’ PlanMandate
 *   Apply bank column DDL if missing
 *   Soft-hide orphan E2E/extra catalog plans with zero enrolments
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string, overrideKeys?: Set<string>) {
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
    if (overrideKeys?.has(key) || !process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(join(process.cwd(), "..", "elio-deploy-env", "plans.env"), new Set(["DATABASE_URL", "DIRECT_DATABASE_URL"]));
loadEnvFile(join(process.cwd(), "packages", "db", ".env"));
loadEnvFile(join(process.cwd(), "apps", "plans", ".env.local"));
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

const WRITE = process.env.CONFIRM_WRITE === "1";
const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";
const OUT = join(process.cwd(), "parity-exports");

type Summary = Record<string, { total: number; written: number; skipped: number; detail?: string }>;
type Prisma = Awaited<ReturnType<typeof importPrisma>>["prisma"];

async function importPrisma() {
  const mod = await import("@elio/db");
  return { prisma: mod.prisma };
}

async function tableExists(prisma: Prisma, name: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    name
  );
  return Boolean(rows[0]?.exists);
}

async function columnExists(prisma: Prisma, table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    ) AS exists`,
    table,
    column
  );
  return Boolean(rows[0]?.exists);
}

async function main() {
  const { prisma } = await importPrisma();
  mkdirSync(OUT, { recursive: true });
  console.log(`\n=== Fill Plans legacy gaps ===`);
  console.log(`practice=${PRACTICE_ID} mode=${WRITE ? "WRITE" : "dry-run"}\n`);

  const practice = await prisma.practice.findUnique({ where: { id: PRACTICE_ID } });
  if (!practice) throw new Error(`Practice ${PRACTICE_ID} not found`);

  const summary: Summary = {};

  // --- 0. Bank columns DDL ---
  summary.bank_ddl = { total: 1, written: 0, skipped: 0 };
  const hasBank = await columnExists(prisma, "plans_mandates", "accountNumberEnding");
  if (!hasBank) {
    if (WRITE) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "plans_mandates" ADD COLUMN IF NOT EXISTS "bankName" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "plans_mandates" ADD COLUMN IF NOT EXISTS "accountNumberEnding" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE "plans_mandates" ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT`);
      summary.bank_ddl.written = 1;
      console.log("âœ“ applied mandate bank columns DDL");
    } else {
      summary.bank_ddl.skipped = 1;
      console.log("â—‹ would apply mandate bank columns DDL");
    }
  } else {
    summary.bank_ddl.skipped = 1;
    console.log("âœ“ mandate bank columns already present");
  }

  // --- Build identity maps: old Patient.id â†’ planPatientId ---
  const oldPatients = (await tableExists(prisma, "Patient"))
    ? await prisma.$queryRawUnsafe<
        { id: string; email: string | null; dentallyPatientId: string | null; firstName: string | null; lastName: string | null }[]
      >(`SELECT id, email, "dentallyPatientId", "firstName", "lastName" FROM "Patient"`)
    : [];

  const newPlanPatients = await prisma.planPatient.findMany({
    where: { practiceId: PRACTICE_ID },
    include: { patient: { select: { id: true, email: true, dentallyId: true } } },
  });

  const oldToPlanPatient = new Map<string, string>();
  for (const o of oldPatients) {
    const byDentally =
      o.dentallyPatientId &&
      newPlanPatients.find((n) => n.patient.dentallyId === o.dentallyPatientId);
    const byEmail =
      o.email &&
      newPlanPatients.find((n) => n.patient.email?.toLowerCase() === o.email!.toLowerCase());
    const match = byDentally || byEmail;
    if (match) oldToPlanPatient.set(o.id, match.id);
  }
  console.log(`Identity map: ${oldToPlanPatient.size}/${oldPatients.length} old patients linked to PlanPatient`);

  // --- Plan name map: old Plan.id â†’ new PlanModel.id (by name, prefer current) ---
  const oldPlans = (await tableExists(prisma, "Plan"))
    ? await prisma.$queryRawUnsafe<{ id: string; name: string }[]>(`SELECT id, name FROM "Plan"`)
    : [];
  const newPlans = await prisma.planModel.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { id: true, name: true, isCurrentVersion: true },
  });
  const oldPlanToNew = new Map<string, string>();
  for (const o of oldPlans) {
    const match =
      newPlans.find((n) => n.name === o.name && n.isCurrentVersion) ||
      newPlans.find((n) => n.name === o.name);
    if (match) oldPlanToNew.set(o.id, match.id);
  }
  console.log(`Plan map: ${oldPlanToNew.size}/${oldPlans.length} legacy plans linked`);

  // Enrolment map: old PatientPlan.id â†’ new enrolment id (via planPatient + plan)
  const oldEnrols = (await tableExists(prisma, "PatientPlan"))
    ? await prisma.$queryRawUnsafe<{ id: string; patientId: string; planId: string; status: string }[]>(
        `SELECT id, "patientId", "planId", status FROM "PatientPlan"`
      )
    : [];
  const newEnrols = await prisma.patientPlanEnrolment.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { id: true, planPatientId: true, planId: true, status: true },
  });
  const oldEnrolToNew = new Map<string, string>();
  for (const o of oldEnrols) {
    const ppId = oldToPlanPatient.get(o.patientId);
    const planId = oldPlanToNew.get(o.planId);
    if (!ppId || !planId) continue;
    const match =
      newEnrols.find((n) => n.planPatientId === ppId && n.planId === planId && n.status === o.status) ||
      newEnrols.find((n) => n.planPatientId === ppId && n.planId === planId);
    if (match) oldEnrolToNew.set(o.id, match.id);
  }
  console.log(`Enrolment map: ${oldEnrolToNew.size}/${oldEnrols.length}`);

  // --- 1. Settings ---
  summary.settings = { total: 0, written: 0, skipped: 0 };
  if (await tableExists(prisma, "Setting")) {
    const rows = await prisma.$queryRawUnsafe<{ key: string; value: string }[]>(
      `SELECT key, value FROM "Setting"`
    );
    summary.settings.total = rows.length;
    for (const row of rows) {
      const existing = await prisma.planPracticeSetting.findUnique({
        where: { practiceId_key: { practiceId: PRACTICE_ID, key: row.key } },
      });
      if (existing) {
        summary.settings.skipped++;
        continue;
      }
      if (WRITE) {
        await prisma.planPracticeSetting.create({
          data: { practiceId: PRACTICE_ID, key: row.key, value: row.value },
        });
        summary.settings.written++;
      } else {
        summary.settings.written++; // would write
      }
    }
    console.log(
      `${WRITE ? "âœ“" : "â—‹"} settings: ${summary.settings.written} ${WRITE ? "written" : "would write"}, ${summary.settings.skipped} already present (of ${summary.settings.total})`
    );
  } else {
    console.log("â­ Setting table missing");
  }

  // --- 2. Patient notes ---
  summary.notes = { total: 0, written: 0, skipped: 0 };
  if (await tableExists(prisma, "PatientNote")) {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; patientId: string; content: string; authorId: string | null; createdAt: Date }[]
    >(`SELECT id, "patientId", content, "authorId", "createdAt" FROM "PatientNote"`);
    summary.notes.total = rows.length;
    for (const row of rows) {
      const planPatientId = oldToPlanPatient.get(row.patientId);
      if (!planPatientId) {
        summary.notes.skipped++;
        continue;
      }
      const already = await prisma.planPatientNote.findFirst({
        where: {
          practiceId: PRACTICE_ID,
          planPatientId,
          content: row.content,
          createdAt: row.createdAt,
        },
      });
      if (already) {
        summary.notes.skipped++;
        continue;
      }
      if (WRITE) {
        await prisma.planPatientNote.create({
          data: {
            practiceId: PRACTICE_ID,
            planPatientId,
            content: row.content,
            authorId: null, // old author users not migrated
            createdAt: row.createdAt,
          },
        });
        summary.notes.written++;
      } else {
        summary.notes.written++;
      }
    }
    console.log(
      `${WRITE ? "âœ“" : "â—‹"} notes: ${summary.notes.written} ${WRITE ? "written" : "would write"}, ${summary.notes.skipped} skipped (of ${summary.notes.total})`
    );
  } else {
    console.log("â­ PatientNote table missing");
  }

  // --- 3. Dentally mappings ---
  summary.mappings = { total: 0, written: 0, skipped: 0 };
  if (await tableExists(prisma, "DentallyPlanMapping")) {
    const rows = await prisma.$queryRawUnsafe<
      { dentallyPlanCode: string; dentallyPlanName: string | null; planId: string; active: boolean }[]
    >(`SELECT "dentallyPlanCode", "dentallyPlanName", "planId", active FROM "DentallyPlanMapping"`);
    summary.mappings.total = rows.length;
    for (const row of rows) {
      if (row.active === false) {
        summary.mappings.skipped++;
        continue;
      }
      const planModelId = oldPlanToNew.get(row.planId);
      const name = (row.dentallyPlanName || row.dentallyPlanCode || "").trim();
      if (!planModelId || !name) {
        summary.mappings.skipped++;
        continue;
      }
      const existing = await prisma.dentallyPlanMapping.findUnique({
        where: { practiceId_dentallyPlanName: { practiceId: PRACTICE_ID, dentallyPlanName: name } },
      });
      if (existing) {
        summary.mappings.skipped++;
        continue;
      }
      if (WRITE) {
        await prisma.dentallyPlanMapping.create({
          data: { practiceId: PRACTICE_ID, dentallyPlanName: name, planModelId },
        });
        summary.mappings.written++;
      } else {
        summary.mappings.written++;
      }
    }
    console.log(
      `${WRITE ? "âœ“" : "â—‹"} mappings: ${summary.mappings.written} ${WRITE ? "written" : "would write"}, ${summary.mappings.skipped} skipped (of ${summary.mappings.total})`
    );
  } else {
    console.log("â­ DentallyPlanMapping table missing");
  }

  // --- 4. Redeem rules ---
  summary.redeem_rules = { total: 0, written: 0, skipped: 0 };
  const oldRuleToNew = new Map<string, string>();
  if (await tableExists(prisma, "RedeemRule")) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "RedeemRule"`);
    summary.redeem_rules.total = rows.length;
    for (const row of rows) {
      const planId = oldPlanToNew.get(row.planId);
      if (!planId) {
        summary.redeem_rules.skipped++;
        continue;
      }
      const existing = await prisma.planRedeemRule.findFirst({
        where: { practiceId: PRACTICE_ID, planId, name: row.name, itemType: row.itemType },
      });
      if (existing) {
        oldRuleToNew.set(row.id, existing.id);
        summary.redeem_rules.skipped++;
        continue;
      }
      if (WRITE) {
        const created = await prisma.planRedeemRule.create({
          data: {
            practiceId: PRACTICE_ID,
            planId,
            itemType: row.itemType,
            name: row.name,
            maxPerYear: row.maxPerYear ?? null,
            cooldownDays: row.cooldownDays ?? null,
            providerType: row.providerType ?? null,
            chairTimeMinutes: row.chairTimeMinutes ?? null,
            requiresApproval: row.requiresApproval ?? true,
            active: row.active ?? true,
            sortOrder: row.sortOrder ?? 0,
          },
        });
        oldRuleToNew.set(row.id, created.id);
        summary.redeem_rules.written++;
      } else {
        summary.redeem_rules.written++;
      }
    }
    console.log(
      `${WRITE ? "âœ“" : "â—‹"} redeem rules: ${summary.redeem_rules.written} ${WRITE ? "written" : "would write"}, ${summary.redeem_rules.skipped} skipped (of ${summary.redeem_rules.total})`
    );
  } else {
    console.log("â­ RedeemRule table missing");
  }

  // --- 5. Redeems ---
  summary.redeems = { total: 0, written: 0, skipped: 0 };
  if (await tableExists(prisma, "Redeem")) {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "Redeem"`);
    summary.redeems.total = rows.length;
    for (const row of rows) {
      const planPatientId = oldToPlanPatient.get(row.patientId);
      const enrolmentId = oldEnrolToNew.get(row.patientPlanId);
      if (!planPatientId || !enrolmentId) {
        summary.redeems.skipped++;
        continue;
      }
      const already = await prisma.planRedeem.findFirst({
        where: {
          practiceId: PRACTICE_ID,
          planPatientId,
          patientPlanEnrolmentId: enrolmentId,
          itemName: row.itemName,
          itemType: row.itemType,
          status: row.status,
          appointmentDate: row.appointmentDate ?? undefined,
        },
      });
      if (already) {
        summary.redeems.skipped++;
        continue;
      }
      if (WRITE) {
        await prisma.planRedeem.create({
          data: {
            practiceId: PRACTICE_ID,
            planPatientId,
            patientPlanEnrolmentId: enrolmentId,
            redeemRuleId: row.redeemRuleId ? oldRuleToNew.get(row.redeemRuleId) ?? null : null,
            itemType: row.itemType,
            itemName: row.itemName,
            description: row.description ?? null,
            appointmentDate: row.appointmentDate ?? null,
            appointmentRef: row.appointmentRef ?? null,
            status: row.status,
            approvedAt: row.approvedAt ?? null,
            rejectionReason: row.rejectionReason ?? null,
            isPartial: row.isPartial ?? false,
            earnedPercentage: row.earnedPercentage != null ? Number(row.earnedPercentage) : null,
            partialReason: row.partialReason ?? null,
            dentallyMatched: row.dentallyMatched ?? false,
            dentallyAppointmentId: row.dentallyAppointmentId ?? null,
            createdAt: row.createdAt ?? undefined,
          },
        });
        summary.redeems.written++;
      } else {
        summary.redeems.written++;
      }
    }
    console.log(
      `${WRITE ? "âœ“" : "â—‹"} redeems: ${summary.redeems.written} ${WRITE ? "written" : "would write"}, ${summary.redeems.skipped} skipped (of ${summary.redeems.total})`
    );
  } else {
    console.log("â­ Redeem table missing");
  }

  // --- 6. Mandate bank fields from OLD ---
  summary.mandate_bank = { total: 0, written: 0, skipped: 0 };
  if ((await tableExists(prisma, "Mandate")) && (await columnExists(prisma, "plans_mandates", "accountNumberEnding"))) {
    const rows = await prisma.$queryRawUnsafe<
      {
        gocardlessMandateId: string;
        bankName: string | null;
        accountNumberEnding: string | null;
        accountHolderName: string | null;
      }[]
    >(
      `SELECT "gocardlessMandateId", "bankName", "accountNumberEnding", "accountHolderName"
       FROM "Mandate"
       WHERE "bankName" IS NOT NULL OR "accountNumberEnding" IS NOT NULL OR "accountHolderName" IS NOT NULL`
    );
    summary.mandate_bank.total = rows.length;
    for (const row of rows) {
      const target = await prisma.planMandate.findUnique({
        where: { gocardlessMandateId: row.gocardlessMandateId },
      });
      if (!target) {
        summary.mandate_bank.skipped++;
        continue;
      }
      const needs =
        (row.bankName && target.bankName !== row.bankName) ||
        (row.accountNumberEnding && target.accountNumberEnding !== row.accountNumberEnding) ||
        (row.accountHolderName && target.accountHolderName !== row.accountHolderName);
      if (!needs && (target.bankName || target.accountNumberEnding || target.accountHolderName)) {
        summary.mandate_bank.skipped++;
        continue;
      }
      if (!needs && !target.bankName && !target.accountNumberEnding && !target.accountHolderName) {
        // empty target, has source
      } else if (!needs) {
        summary.mandate_bank.skipped++;
        continue;
      }
      if (WRITE) {
        await prisma.planMandate.update({
          where: { id: target.id },
          data: {
            bankName: row.bankName ?? target.bankName,
            accountNumberEnding: row.accountNumberEnding ?? target.accountNumberEnding,
            accountHolderName: row.accountHolderName ?? target.accountHolderName,
          },
        });
        summary.mandate_bank.written++;
      } else {
        summary.mandate_bank.written++;
      }
    }
    console.log(
      `${WRITE ? "âœ“" : "â—‹"} mandate bank: ${summary.mandate_bank.written} ${WRITE ? "updated" : "would update"}, ${summary.mandate_bank.skipped} skipped (of ${summary.mandate_bank.total})`
    );
  } else {
    console.log("â­ mandate bank backfill skipped (missing table/columns)");
  }

  // --- 7. Hide orphan NEW-only catalog plans with zero enrolments (not in legacy names) ---
  summary.orphan_plans = { total: 0, written: 0, skipped: 0 };
  const legacyNames = new Set(oldPlans.map((p) => p.name));
  const extras = newPlans.filter((p) => !legacyNames.has(p.name));
  summary.orphan_plans.total = extras.length;
  for (const p of extras) {
    const enrolCount = await prisma.patientPlanEnrolment.count({ where: { planId: p.id } });
    const isTest = /e2e|sandbox|test plan/i.test(p.name);
    if (enrolCount > 0 && !isTest) {
      summary.orphan_plans.skipped++;
      continue;
    }
    // Soft-hide: isCurrentVersion=false so Plans UI catalog matches legacy focus
    if (p.isCurrentVersion || isTest) {
      if (WRITE) {
        if (isTest && enrolCount === 0) {
          await prisma.planInclusion.deleteMany({ where: { planId: p.id } });
          await prisma.planDiscount.deleteMany({ where: { planId: p.id } });
          await prisma.planEligibilityRule.deleteMany({ where: { planId: p.id } });
          await prisma.planRedeemRule.deleteMany({ where: { planId: p.id } });
          await prisma.dentallyPlanMapping.deleteMany({ where: { planModelId: p.id } });
          await prisma.planPatient.updateMany({ where: { planModelId: p.id }, data: { planModelId: null } });
          await prisma.planModel.delete({ where: { id: p.id } });
        } else {
          await prisma.planModel.update({
            where: { id: p.id },
            data: { isCurrentVersion: false, active: false },
          });
        }
        summary.orphan_plans.written++;
      } else {
        summary.orphan_plans.written++;
      }
    } else {
      summary.orphan_plans.skipped++;
    }
  }
  console.log(
    `${WRITE ? "âœ“" : "â—‹"} orphan/extra plans: ${summary.orphan_plans.written} ${WRITE ? "hidden/deleted" : "would hide/delete"}, ${summary.orphan_plans.skipped} kept (of ${summary.orphan_plans.total} NEW-only)`
  );

  const outPath = join(OUT, "plans-gap-fill-summary.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        practiceId: PRACTICE_ID,
        mode: WRITE ? "write" : "dry-run",
        at: new Date().toISOString(),
        maps: {
          patients: oldToPlanPatient.size,
          plans: oldPlanToNew.size,
          enrolments: oldEnrolToNew.size,
        },
        summary,
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
  if (!WRITE) console.log("\nRe-run with CONFIRM_WRITE=1 to apply.\n");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

