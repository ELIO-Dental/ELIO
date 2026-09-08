/**
 * Read-only: compare legacy ElioPlans PascalCase tables vs new plans_* tables
 * in the same Neon DB. Flags count mismatches, money conversion issues,
 * orphan links, and test/seed contamination.
 *
 * Usage (from elio/):
 *   npx tsx scripts/audit-plans-data-consistency.ts
 *   PRACTICE_ID=... DATABASE_URL=... npx tsx scripts/audit-plans-data-consistency.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@elio/db";
import { activeMemberEnrolmentWhere } from "@elio/plans-engine";

type Finding = {
  severity: "PASS" | "WARN" | "FAIL";
  module: string;
  check: string;
  detail: string;
};

const findings: Finding[] = [];

function loadEnvFile(path: string, overrideKeys?: Set<string>) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (overrideKeys?.has(key) || !process.env[key]) process.env[key] = val;
  }
}

function record(severity: Finding["severity"], module: string, check: string, detail: string) {
  findings.push({ severity, module, check, detail });
  const icon = severity === "PASS" ? "✓" : severity === "WARN" ? "⚠" : "✗";
  console.log(`${icon} [${module}] ${check}: ${detail}`);
}

async function tableExists(name: string) {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    name
  );
  return Boolean(rows[0]?.exists);
}

async function countRaw(sql: string) {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

function compareCounts(
  module: string,
  label: string,
  oldCount: number,
  newCount: number,
  opts?: { allowNewHigher?: boolean; note?: string }
) {
  if (oldCount === newCount) {
    record("PASS", module, label, `OLD=${oldCount} NEW=${newCount}`);
    return;
  }
  if (opts?.allowNewHigher && newCount >= oldCount) {
    record(
      "WARN",
      module,
      label,
      `OLD=${oldCount} NEW=${newCount} (NEW ≥ OLD — possible post-migration growth)${opts.note ? ` — ${opts.note}` : ""}`
    );
    return;
  }
  record(
    "FAIL",
    module,
    label,
    `OLD=${oldCount} NEW=${newCount}${opts?.note ? ` — ${opts.note}` : ""}`
  );
}

async function main() {
  loadEnvFile(join(process.cwd(), "..", "elio-deploy-env", "plans.env"), new Set(["DATABASE_URL", "DIRECT_DATABASE_URL"]));
  loadEnvFile(join(process.cwd(), "packages", "db", ".env"));
  loadEnvFile(join(process.cwd(), "apps", "plans", ".env.local"));
  // Prefer direct host — pooler + IPv6 is flaky from some Windows networks
  if (process.env.DIRECT_DATABASE_URL?.trim()) {
    process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
  }

  console.log("\n=== Elio Plans data consistency audit (read-only) ===\n");

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const practices = await prisma.practice.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`Practices (${practices.length}):`);
  for (const p of practices) console.log(`  - ${p.name} (${p.id})`);

  const practiceId =
    process.env.PRACTICE_ID?.trim() ||
    practices.find((p) => p.id !== "seed-practice")?.id ||
    practices[0]?.id;

  if (!practiceId) {
    record("FAIL", "tenant", "practice", "no Practice rows");
    await prisma.$disconnect();
    process.exit(1);
  }

  const practice = practices.find((p) => p.id === practiceId)!;
  record("PASS", "tenant", "practice", `auditing "${practice.name}" (${practice.id})`);

  // Contaminants — Aura live tenant historically uses id "seed-practice"
  if (practiceId === "seed-practice") {
    record(
      "PASS",
      "contamination",
      "practice-id",
      `live tenant id is "seed-practice" (Aura Dental Clinic) — production, not demo`
    );
  }

  const testEmails = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: "@elio.dev" } },
        { email: { endsWith: "@elio.test" } },
        { email: { endsWith: "@elioplans.com" } },
        { email: { contains: "seed." } },
        { email: { contains: "e2e" } },
      ],
    },
    select: { email: true, practiceId: true },
  });
  if (testEmails.length) {
    record(
      "WARN",
      "contamination",
      "test-users",
      testEmails.map((u) => `${u.email}@${u.practiceId ?? "null"}`).join(", ")
    );
  } else {
    record("PASS", "contamination", "test-users", "none matching seed/e2e patterns");
  }

  const e2ePractices = practices.filter(
    (p) =>
      p.id.includes("e2e") ||
      p.name.toLowerCase().includes("test") ||
      p.name.toLowerCase().includes("developer")
  );
  if (e2ePractices.length) {
    record(
      "WARN",
      "contamination",
      "test-practices",
      e2ePractices.map((p) => `${p.name} (${p.id})`).join(", ")
    );
  } else {
    record("PASS", "contamination", "test-practices", "none named test/e2e");
  }

  const legacyTables = [
    "Plan",
    "Patient",
    "PatientPlan",
    "Mandate",
    "Payment",
    "Redeem",
    "RedeemRule",
    "DentallyPlanMapping",
    "Setting",
    "PatientNote",
    "Document",
    "DocumentAcceptance",
    "SigningRequest",
    "GuideArticle",
    "EmailLog",
  ];
  const legacyPresent: Record<string, boolean> = {};
  for (const t of legacyTables) {
    legacyPresent[t] = await tableExists(t);
  }
  const missingLegacy = legacyTables.filter((t) => !legacyPresent[t]);
  if (missingLegacy.length) {
    record("WARN", "legacy", "tables", `missing: ${missingLegacy.join(", ")}`);
  } else {
    record("PASS", "legacy", "tables", "all expected PascalCase tables present");
  }

  // --- Plans catalog ---
  if (legacyPresent.Plan) {
    const oldPlans = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "Plan"`);
    const newPlans = await prisma.planModel.count({ where: { practiceId } });
    compareCounts("plans", "catalog-count", oldPlans, newPlans, {
      allowNewHigher: true,
      note: "names/prices also spot-checked",
    });

    const oldRows = await prisma.$queryRawUnsafe<
      { name: string; monthlyPrice: unknown; isCurrentVersion: boolean }[]
    >(`SELECT name, "monthlyPrice", "isCurrentVersion" FROM "Plan" ORDER BY name`);
    const newRows = await prisma.planModel.findMany({
      where: { practiceId },
      select: { name: true, monthlyPricePence: true, isCurrentVersion: true },
      orderBy: { name: "asc" },
    });

    const newByName = new Map(newRows.map((r) => [r.name, r]));
    let priceMismatches = 0;
    let missingInNew = 0;
    for (const o of oldRows) {
      const n = newByName.get(o.name);
      if (!n) {
        missingInNew++;
        record("FAIL", "plans", `missing-plan:${o.name}`, "present in OLD, absent in NEW");
        continue;
      }
      const oldPence = Math.round(Number(o.monthlyPrice) * 100);
      if (oldPence !== n.monthlyPricePence) {
        priceMismatches++;
        record(
          "FAIL",
          "plans",
          `price:${o.name}`,
          `OLD=${oldPence}p NEW=${n.monthlyPricePence}p`
        );
      }
      if (Boolean(o.isCurrentVersion) !== n.isCurrentVersion) {
        record(
          "WARN",
          "plans",
          `version-flag:${o.name}`,
          `OLD isCurrent=${o.isCurrentVersion} NEW=${n.isCurrentVersion}`
        );
      }
    }
    if (priceMismatches === 0 && missingInNew === 0) {
      record("PASS", "plans", "name-price-match", `${oldRows.length} OLD plan(s) matched in NEW by name+pence`);
    }

    const oldNames = new Set(oldRows.map((r) => r.name));
    const extras = newRows.filter((r) => !oldNames.has(r.name));
    const extraCurrent = extras.filter((r) => r.isCurrentVersion);
    if (extras.length) {
      const e2eExtras = extras.filter((e) => /e2e|test|sandbox|demo/i.test(e.name));
      record(
        e2eExtras.length > 0 ? "FAIL" : extras.length > 10 || extraCurrent.length > 0 ? "WARN" : "PASS",
        "plans",
        "extra-in-new",
        `${extras.length} NEW-only plan(s); ${extraCurrent.length} marked current; ${e2eExtras.length} look like test — sample: ${extras
          .slice(0, 8)
          .map((e) => e.name)
          .join(", ")}`
      );
    }

    // Duplicate plan names in NEW (migration re-run risk)
    const dupNames = await prisma.$queryRawUnsafe<{ name: string; c: bigint }[]>(
      `SELECT name, COUNT(*)::bigint AS c FROM plans_plans WHERE "practiceId" = $1 GROUP BY name HAVING COUNT(*) > 1`,
      practiceId
    );
    if (dupNames.length) {
      record(
        "FAIL",
        "plans",
        "duplicate-names",
        dupNames.map((d) => `${d.name}×${d.c}`).join(", ")
      );
    } else {
      record("PASS", "plans", "duplicate-names", "none");
    }
  }

  // --- Patients / enrolments ---
  if (legacyPresent.Patient) {
    const oldPatients = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "Patient"`);
    const newPlanPatients = await prisma.planPatient.count({ where: { practiceId } });
    compareCounts("patients", "plan-patient-count", oldPatients, newPlanPatients, {
      allowNewHigher: true,
      note: "NEW may grow via Dentally sync after migration",
    });
  }

  if (legacyPresent.PatientPlan) {
    const oldByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM "PatientPlan" GROUP BY status ORDER BY status`
    );
    const newByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM plans_patient_plan_enrolments WHERE "practiceId" = $1 GROUP BY status ORDER BY status`,
      practiceId
    );
    const oldMap = Object.fromEntries(oldByStatus.map((r) => [r.status, Number(r.c)]));
    const newMap = Object.fromEntries(newByStatus.map((r) => [r.status, Number(r.c)]));
    const statuses = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
    for (const s of statuses) {
      compareCounts("enrolments", `status:${s}`, oldMap[s] ?? 0, newMap[s] ?? 0, {
        allowNewHigher: true,
      });
    }

    const oldActive = oldMap.ACTIVE ?? 0;
    const newActive = await prisma.patientPlanEnrolment.count({
      where: { practiceId, status: "ACTIVE" },
    });
    compareCounts("enrolments", "ACTIVE", oldActive, newActive, { allowNewHigher: true });
  }

  // Mandate-aware active members
  if (legacyPresent.PatientPlan && legacyPresent.Mandate) {
    const oldActiveMembers = await countRaw(`
      SELECT COUNT(*)::bigint AS count
      FROM "PatientPlan" pp
      WHERE pp.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."patientId" = pp."patientId" AND m.status = 'ACTIVE'
        )`);
    const newActiveMembers = await prisma.patientPlanEnrolment.count({
      where: activeMemberEnrolmentWhere(practiceId),
    });
    // Legacy PascalCase tables are a frozen snapshot; NEW may grow via live GC/Dentally.
    // FAIL only on data loss (NEW < OLD). Growth is WARN with identity listing.
    if (newActiveMembers === oldActiveMembers) {
      record("PASS", "dashboard", "active-members-mandate-aware", `OLD=${oldActiveMembers} NEW=${newActiveMembers}`);
    } else if (newActiveMembers > oldActiveMembers) {
      record(
        "WARN",
        "dashboard",
        "active-members-mandate-aware",
        `OLD=${oldActiveMembers} NEW=${newActiveMembers} (NEW higher — list new-only below; confirm not test junk)`
      );
    } else {
      record(
        "FAIL",
        "dashboard",
        "active-members-mandate-aware",
        `OLD=${oldActiveMembers} NEW=${newActiveMembers} — NEW lower than legacy (possible missing migration)`
      );
    }

    // Identify NEW-only active members (by email / dentally id) for contradiction review
    const oldActivePeople = await prisma.$queryRawUnsafe<
      { email: string | null; dentally: string | null; name: string }[]
    >(`
      SELECT DISTINCT COALESCE(p.email, '') AS email,
             COALESCE(p."dentallyPatientId", '') AS dentally,
             TRIM(CONCAT(COALESCE(p."firstName",''), ' ', COALESCE(p."lastName",''))) AS name
      FROM "PatientPlan" pp
      JOIN "Patient" p ON p.id = pp."patientId"
      WHERE pp.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM "Mandate" m
          WHERE m."patientId" = pp."patientId" AND m.status = 'ACTIVE'
        )`);
    const newActivePeople = await prisma.$queryRawUnsafe<
      { email: string | null; dentally: string | null; name: string; enrolId: string }[]
    >(`
      SELECT COALESCE(cp.email, '') AS email,
             COALESCE(cp."dentallyId", '') AS dentally,
             TRIM(CONCAT(COALESCE(cp."firstName",''), ' ', COALESCE(cp."lastName",''))) AS name,
             e.id AS "enrolId"
      FROM plans_patient_plan_enrolments e
      JOIN plans_patients pp ON pp.id = e."planPatientId"
      JOIN dentally_patients cp ON cp.id = pp."patientId"
      WHERE e."practiceId" = $1
        AND e.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM plans_mandates m
          WHERE m."planPatientId" = pp.id AND m.status = 'ACTIVE'
        )`,
      practiceId
    );
    const oldKeys = new Set(
      oldActivePeople.flatMap((p) =>
        [p.dentally && `d:${p.dentally}`, p.email && `e:${p.email.toLowerCase()}`].filter(Boolean) as string[]
      )
    );
    const newOnly = newActivePeople.filter((p) => {
      const keys = [p.dentally && `d:${p.dentally}`, p.email && `e:${p.email.toLowerCase()}`].filter(
        Boolean
      ) as string[];
      return keys.length === 0 || !keys.some((k) => oldKeys.has(k));
    });
    if (newOnly.length) {
      const testLooking = newOnly.filter(
        (p) =>
          /sandbox|test|e2e|example\.com|elio\.(dev|test)/i.test(
            `${p.name} ${p.email} ${p.dentally}`
          )
      );
      record(
        testLooking.length ? "FAIL" : "WARN",
        "dashboard",
        "active-members-new-only",
        newOnly
          .slice(0, 15)
          .map((p) => `${p.name || "?"} <${p.email || "no-email"}> dentally=${p.dentally || "none"}`)
          .join(" | ") + (testLooking.length ? ` [${testLooking.length} look like TEST]` : "")
      );
    } else if (newActiveMembers !== oldActiveMembers) {
      record(
        "WARN",
        "dashboard",
        "active-members-diff",
        "count differs but all NEW actives matched OLD by email/dentally — possible duplicate enrolments"
      );
    }
  }

  // --- Mandates ---
  if (legacyPresent.Mandate) {
    const oldByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM "Mandate" GROUP BY status ORDER BY status`
    );
    const newByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM plans_mandates WHERE "practiceId" = $1 GROUP BY status ORDER BY status`,
      practiceId
    );
    const oldMap = Object.fromEntries(oldByStatus.map((r) => [r.status, Number(r.c)]));
    const newMap = Object.fromEntries(newByStatus.map((r) => [r.status, Number(r.c)]));
    for (const s of new Set([...Object.keys(oldMap), ...Object.keys(newMap)])) {
      compareCounts("mandates", `status:${s}`, oldMap[s] ?? 0, newMap[s] ?? 0, {
        allowNewHigher: true,
      });
    }

    // GC mandate id overlap
    const oldGc = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "gocardlessMandateId" AS id FROM "Mandate" WHERE "gocardlessMandateId" IS NOT NULL`
    );
    const newGcRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "gocardlessMandateId" AS id FROM plans_mandates
       WHERE "practiceId" = $1 AND "gocardlessMandateId" IS NOT NULL`,
      practiceId
    );
    const newSet = new Set(newGcRows.map((m) => m.id));
    const missingGc = oldGc.filter((o) => o.id && !newSet.has(o.id));
    if (missingGc.length) {
      record(
        "FAIL",
        "mandates",
        "gocardless-ids-missing",
        `${missingGc.length} OLD GC mandate id(s) not in NEW (sample: ${missingGc
          .slice(0, 5)
          .map((m) => m.id)
          .join(", ")})`
      );
    } else {
      record("PASS", "mandates", "gocardless-ids", `all ${oldGc.length} OLD GC mandate ids present in NEW`);
    }

    const mandateCols = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'plans_mandates'`
    );
    const mandateColSet = new Set(mandateCols.map((c) => c.column_name));
    const hasBankCols =
      mandateColSet.has("accountNumberEnding") ||
      mandateColSet.has("bankName") ||
      mandateColSet.has("accountHolderName");
    if (!hasBankCols) {
      record(
        "WARN",
        "mandates",
        "bank-fields",
        "DB missing bank columns (migration 20260908120000 not applied on this DB yet)"
      );
    } else {
      const withBank = Number(
        (
          await prisma.$queryRawUnsafe<{ count: bigint }[]>(
            `SELECT COUNT(*)::bigint AS count FROM plans_mandates
             WHERE "practiceId" = $1 AND status = 'ACTIVE'
               AND ("accountNumberEnding" IS NOT NULL OR "bankName" IS NOT NULL OR "accountHolderName" IS NOT NULL)`,
            practiceId
          )
        )[0]?.count ?? 0
      );
      const activeMandates = await prisma.planMandate.count({ where: { practiceId, status: "ACTIVE" } });
      record(
        withBank > 0 || activeMandates === 0 ? "PASS" : "WARN",
        "mandates",
        "bank-fields",
        `${withBank}/${activeMandates} ACTIVE have any bank detail fields`
      );
    }
  }

  // --- Payments ---
  if (legacyPresent.Payment) {
    const oldByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM "Payment" GROUP BY status ORDER BY status`
    );
    const newByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM plans_payments WHERE "practiceId" = $1 GROUP BY status ORDER BY status`,
      practiceId
    );
    const oldMap = Object.fromEntries(oldByStatus.map((r) => [r.status, Number(r.c)]));
    const newMap = Object.fromEntries(newByStatus.map((r) => [r.status, Number(r.c)]));
    for (const s of new Set([...Object.keys(oldMap), ...Object.keys(newMap)])) {
      compareCounts("payments", `status:${s}`, oldMap[s] ?? 0, newMap[s] ?? 0, {
        allowNewHigher: true,
      });
    }

    const oldSum = await prisma.$queryRawUnsafe<{ s: unknown }[]>(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM "Payment"`
    );
    const newSum = await prisma.$queryRawUnsafe<{ s: bigint }[]>(
      `SELECT COALESCE(SUM("amountPence"), 0)::bigint AS s FROM plans_payments WHERE "practiceId" = $1`,
      practiceId
    );
    const oldPence = Math.round(Number(oldSum[0]?.s ?? 0) * 100);
    const newPence = Number(newSum[0]?.s ?? 0);
    if (oldPence === newPence) {
      record("PASS", "payments", "amount-sum-pence", `OLD+NEW=${newPence}p`);
    } else if (Math.abs(oldPence - newPence) <= 1) {
      record("WARN", "payments", "amount-sum-pence", `OLD=${oldPence}p NEW=${newPence}p (±1 rounding)`);
    } else if (newPence >= oldPence) {
      record(
        "WARN",
        "payments",
        "amount-sum-pence",
        `OLD=${oldPence}p NEW=${newPence}p (NEW higher — post-migration charges?)`
      );
    } else {
      record("FAIL", "payments", "amount-sum-pence", `OLD=${oldPence}p NEW=${newPence}p`);
    }

    const oldGcPay = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "gocardlessPaymentId" AS id FROM "Payment" WHERE "gocardlessPaymentId" IS NOT NULL`
    );
    const newGcPay = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "gocardlessPaymentId" AS id FROM plans_payments
       WHERE "practiceId" = $1 AND "gocardlessPaymentId" IS NOT NULL`,
      practiceId
    );
    const newPaySet = new Set(newGcPay.map((p) => p.id));
    const missingPay = oldGcPay.filter((o) => o.id && !newPaySet.has(o.id));
    if (missingPay.length) {
      record(
        "FAIL",
        "payments",
        "gocardless-ids-missing",
        `${missingPay.length} OLD GC payment id(s) not in NEW`
      );
    } else {
      record("PASS", "payments", "gocardless-ids", `all ${oldGcPay.length} OLD GC payment ids in NEW`);
    }
  }

  // --- Redeems ---
  if (legacyPresent.Redeem) {
    const oldRedeems = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "Redeem"`);
    const newRedeems = await prisma.planRedeem.count({ where: { practiceId } });
    compareCounts("redeems", "count", oldRedeems, newRedeems, { allowNewHigher: true });

    const oldByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM "Redeem" GROUP BY status`
    );
    const newByStatus = await prisma.$queryRawUnsafe<{ status: string; c: bigint }[]>(
      `SELECT status, COUNT(*)::bigint AS c FROM plans_redeems WHERE "practiceId" = $1 GROUP BY status`,
      practiceId
    );
    const oldMap = Object.fromEntries(oldByStatus.map((r) => [r.status, Number(r.c)]));
    const newMap = Object.fromEntries(newByStatus.map((r) => [r.status, Number(r.c)]));
    for (const s of new Set([...Object.keys(oldMap), ...Object.keys(newMap)])) {
      compareCounts("redeems", `status:${s}`, oldMap[s] ?? 0, newMap[s] ?? 0, {
        allowNewHigher: true,
      });
    }
  } else {
    const newRedeems = await prisma.planRedeem.count({ where: { practiceId } });
    record("WARN", "redeems", "legacy-table", `OLD Redeem table missing; NEW has ${newRedeems}`);
  }

  if (legacyPresent.RedeemRule) {
    const oldRules = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "RedeemRule"`);
    const newRules = await prisma.planRedeemRule.count({ where: { practiceId } });
    compareCounts("redeems", "rules", oldRules, newRules, { allowNewHigher: true });
  }

  // --- Dentally mappings & settings (often not in original migrate) ---
  if (legacyPresent.DentallyPlanMapping) {
    const oldMaps = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "DentallyPlanMapping"`);
    const newMaps = await prisma.dentallyPlanMapping.count({ where: { practiceId } });
    compareCounts("dentally", "mappings", oldMaps, newMaps, {
      note: "not in original migrate-elioplans — must be restored separately",
    });
  }

  if (legacyPresent.Setting) {
    const oldSettings = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "Setting"`);
    const newSettings = await prisma.planPracticeSetting.count({ where: { practiceId } });
    if (newSettings === 0 && oldSettings > 0) {
      record(
        "FAIL",
        "settings",
        "migrated",
        `OLD=${oldSettings} NEW=0 — settings were not migrated by migrate-elioplans`
      );
    } else {
      compareCounts("settings", "count", oldSettings, newSettings, { allowNewHigher: true });
    }
  }

  if (legacyPresent.PatientNote) {
    const oldNotes = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "PatientNote"`);
    const newNotes = await prisma.planPatientNote.count({ where: { practiceId } });
    if (oldNotes > 0 && newNotes === 0) {
      record("FAIL", "notes", "migrated", `OLD=${oldNotes} NEW=0 — notes not migrated`);
    } else {
      compareCounts("notes", "count", oldNotes, newNotes, { allowNewHigher: true });
    }
  }

  // --- Documents / signing / guides ---
  if (legacyPresent.Document) {
    const oldDocs = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "Document"`);
    const newDocs = await prisma.planDocument.count({ where: { practiceId } });
    compareCounts("documents", "count", oldDocs, newDocs, { allowNewHigher: true });
  }
  if (legacyPresent.DocumentAcceptance) {
    const oldAcc = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "DocumentAcceptance"`);
    const newAcc = await prisma.planDocumentAcceptance.count({ where: { practiceId } });
    compareCounts("documents", "acceptances", oldAcc, newAcc, { allowNewHigher: true });
  }
  if (legacyPresent.SigningRequest) {
    const oldSig = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "SigningRequest"`);
    const newSig = await prisma.planSigningRequest.count({ where: { practiceId } });
    compareCounts("documents", "signing-requests", oldSig, newSig, { allowNewHigher: true });
  }
  if (legacyPresent.GuideArticle) {
    const oldGuides = await countRaw(`SELECT COUNT(*)::bigint AS count FROM "GuideArticle"`);
    const newGuides = await prisma.planGuideArticle.count({ where: { practiceId } });
    compareCounts("guides", "articles", oldGuides, newGuides, { allowNewHigher: true });
  }

  // Orphans / contradictions inside NEW
  const orphanEnrols = Number(
    (
      await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM plans_patient_plan_enrolments e
         WHERE e."practiceId" = $1
           AND NOT EXISTS (SELECT 1 FROM plans_patients pp WHERE pp.id = e."planPatientId")`,
        practiceId
      )
    )[0]?.count ?? 0
  );
  const orphanPays = Number(
    (
      await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM plans_payments p
         WHERE p."practiceId" = $1
           AND NOT EXISTS (SELECT 1 FROM plans_patients pp WHERE pp.id = p."planPatientId")`,
        practiceId
      )
    )[0]?.count ?? 0
  );
  const orphanMandates = Number(
    (
      await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM plans_mandates m
         WHERE m."practiceId" = $1
           AND NOT EXISTS (SELECT 1 FROM plans_patients pp WHERE pp.id = m."planPatientId")`,
        practiceId
      )
    )[0]?.count ?? 0
  );

  record(
    orphanEnrols === 0 ? "PASS" : "FAIL",
    "integrity",
    "orphan-enrolments",
    String(orphanEnrols)
  );
  record(orphanPays === 0 ? "PASS" : "FAIL", "integrity", "orphan-payments", String(orphanPays));
  record(
    orphanMandates === 0 ? "PASS" : "FAIL",
    "integrity",
    "orphan-mandates",
    String(orphanMandates)
  );

  // ACTIVE enrolments pointing at inactive/missing plan models
  const badPlanRefs = Number(
    (
      await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count
         FROM plans_patient_plan_enrolments e
         LEFT JOIN plans_plans pl ON pl.id = e."planId"
         WHERE e."practiceId" = $1
           AND e.status = 'ACTIVE'
           AND (pl.id IS NULL OR pl."isCurrentVersion" = false OR pl.active = false)`,
        practiceId
      )
    )[0]?.count ?? 0
  );
  record(
    badPlanRefs === 0 ? "PASS" : "WARN",
    "integrity",
    "active-enrol-on-stale-plan",
    String(badPlanRefs)
  );

  // Pending DD cohort
  const pendingDd = await prisma.planPatient.count({
    where: {
      practiceId,
      status: "ACTIVE",
      mandates: { none: { status: "ACTIVE" } },
      patientPlans: { some: { status: "ACTIVE" } },
    },
  });
  record("PASS", "action-required", "pending-dd-cohort", `${pendingDd} ACTIVE members without ACTIVE mandate`);

  const failedPays = await prisma.planPayment.count({ where: { practiceId, status: "FAILED" } });
  record("PASS", "action-required", "failed-payments", String(failedPays));

  // Summary
  const fails = findings.filter((f) => f.severity === "FAIL");
  const warns = findings.filter((f) => f.severity === "WARN");
  console.log("\n=== Summary ===");
  console.log(`PASS: ${findings.filter((f) => f.severity === "PASS").length}`);
  console.log(`WARN: ${warns.length}`);
  console.log(`FAIL: ${fails.length}`);
  if (fails.length) {
    console.log("\nFailures:");
    for (const f of fails) console.log(`  - [${f.module}] ${f.check}: ${f.detail}`);
  }
  if (warns.length) {
    console.log("\nWarnings:");
    for (const f of warns) console.log(`  - [${f.module}] ${f.check}: ${f.detail}`);
  }

  const outDir = join(process.cwd(), "parity-exports");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "plans-data-consistency.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        practiceId,
        practiceName: practice.name,
        auditedAt: new Date().toISOString(),
        summary: { pass: findings.filter((f) => f.severity === "PASS").length, warn: warns.length, fail: fails.length },
        findings,
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${outPath}\n`);

  await prisma.$disconnect();
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
