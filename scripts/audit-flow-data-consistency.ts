/**
 * Read-only: Elio Flow data consistency vs legacy ElioFlow Google Sheet export
 * + contamination / integrity checks for every Flow module.
 *
 * Usage (from elio/):
 *   npx tsx scripts/audit-flow-data-consistency.ts
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
  const { compareFlowDashboardParity, parseLegacyFlowExportFile } = await import(
    "../apps/flow/lib/flow-parity"
  );

  const practiceId = process.env.PRACTICE_ID?.trim() || "seed-practice";
  console.log(`\n=== Elio Flow data consistency audit ===\npractice=${practiceId}\n`);

  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { id: true, name: true },
  });
  if (!practice) {
    record("FAIL", "tenant", "practice", "not found");
    await prisma.$disconnect();
    process.exit(1);
  }
  record("PASS", "tenant", "practice", `"${practice.name}" (${practice.id})`);

  // --- Legacy KPI parity (all-time, same as Sheet export) ---
  const legacyPath = join(process.cwd(), "parity-exports", "legacy-flow-stats.json");
  if (!existsSync(legacyPath)) {
    record("FAIL", "dashboard", "legacy-export", `missing ${legacyPath}`);
  } else {
    const legacy = parseLegacyFlowExportFile(readFileSync(legacyPath, "utf8"));
    const dash = await getFlowDashboard(practiceId);
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
    if (cmp.ok) {
      record(
        "PASS",
        "dashboard",
        "kpi-vs-legacy-sheet",
        `consults=${current.totalConsultations} converted=${current.converted} stuck=${current.stuck} rate=${current.conversionRate}% paid=£${Math.round(current.totalPaidPence / 100)}`
      );
    } else {
      for (const d of cmp.diffs) {
        record("FAIL", "dashboard", `kpi:${d.field}`, `legacy=${d.legacy} live=${d.current} delta=${d.delta}`);
      }
    }
  }

  // --- Module counts ---
  const [
    consultCount,
    enquiryCount,
    enquiryOpen,
    reminderCount,
    reminderOpen,
    legacyArchive,
    outcomeGroups,
  ] = await Promise.all([
    prisma.consult.count({ where: { practiceId } }),
    prisma.enquiry.count({ where: { practiceId } }),
    prisma.enquiry.count({ where: { practiceId, consults: { none: {} } } }),
    prisma.reminder.count({ where: { practiceId } }),
    prisma.reminder.count({ where: { practiceId, sentAt: null } }),
    prisma.legacyFlowTouchPointArchive.count({ where: { practiceId } }).catch(() => 0),
    prisma.consult.groupBy({
      by: ["outcome"],
      where: { practiceId },
      _count: true,
    }),
  ]);

  record("PASS", "consults", "count", String(consultCount));
  record(
    consultCount === 819 ? "PASS" : "WARN",
    "consults",
    "vs-legacy-819",
    `live=${consultCount} (legacy Sheet export was 819)`
  );
  record("PASS", "enquiries", "total", String(enquiryCount));
  record("PASS", "enquiries", "open-no-consult", String(enquiryOpen));
  record("PASS", "reminders", "total", String(reminderCount));
  record("PASS", "reminders", "outstanding", String(reminderOpen));
  record("PASS", "touchpoints", "legacy-archive-rows", String(legacyArchive));
  record(
    "PASS",
    "consults",
    "outcomes",
    outcomeGroups.map((g) => `${g.outcome ?? "null"}=${g._count}`).join(", ")
  );

  // Stuck reasons wrongly DECLINED
  const badDeclined = await prisma.consult.count({
    where: {
      practiceId,
      outcome: "DECLINED",
      stuckReason: { in: ["FAILED_FINANCE", "PRICE_SHOPPING", "BAD_EXPERIENCE", "OUT_OF_BUDGET"] },
    },
  });
  record(
    badDeclined === 0 ? "PASS" : "FAIL",
    "consults",
    "stuck-as-declined",
    badDeclined === 0 ? "none" : `${badDeclined} still DECLINED with stuck reason`
  );

  // --- Contamination: test patients / consults / enquiries ---
  const testPatients = await prisma.patient.findMany({
    where: {
      practiceId,
      OR: [
        { dentallyId: { startsWith: "e2e-" } },
        { dentallyId: { startsWith: "gc-sandbox" } },
        { dentallyId: { contains: "test" } },
        { email: { endsWith: "@example.test" } },
        { email: { endsWith: "@example.com" } },
        { email: { contains: "sandbox" } },
        { firstName: { equals: "E2E" } },
        { firstName: { equals: "Sandbox" } },
        { lastName: { contains: "Tester" } },
        { AND: [{ firstName: { contains: "UAT" } }] },
        { lastName: { contains: "UAT" } },
      ],
    },
    select: { id: true, dentallyId: true, email: true, firstName: true, lastName: true },
    take: 50,
  });

  // Narrow: exclude real patients with "test" substring in dentallyId accidentally
  const junkPatients = testPatients.filter((p) => {
    const blob = `${p.dentallyId} ${p.email} ${p.firstName} ${p.lastName}`.toLowerCase();
    return (
      blob.includes("e2e") ||
      blob.includes("sandbox") ||
      blob.includes("@example.") ||
      blob.includes("uat ") ||
      /^uat/i.test(p.firstName ?? "") ||
      /^test/i.test(p.firstName ?? "")
    );
  });

  if (junkPatients.length) {
    record(
      "FAIL",
      "contamination",
      "test-patients",
      junkPatients
        .slice(0, 10)
        .map((p) => `${p.firstName} ${p.lastName} <${p.email}> ${p.dentallyId}`)
        .join(" | ") + (junkPatients.length > 10 ? ` (+${junkPatients.length - 10})` : "")
    );
  } else {
    record("PASS", "contamination", "test-patients", "none matching e2e/sandbox/UAT patterns");
  }

  const testEnquiries = await prisma.enquiry.findMany({
    where: {
      practiceId,
      OR: [
        { source: { contains: "e2e", mode: "insensitive" } },
        { source: { contains: "test", mode: "insensitive" } },
        { source: { contains: "uat", mode: "insensitive" } },
        { source: { contains: "sandbox", mode: "insensitive" } },
      ],
    },
    select: { id: true, source: true },
    take: 30,
  });
  // "test" in source might be too broad — only flag e2e/uat/sandbox
  const junkEnquiries = testEnquiries.filter((e) =>
    /e2e|uat|sandbox|playwright/i.test(e.source ?? "")
  );
  record(
    junkEnquiries.length === 0 ? "PASS" : "FAIL",
    "contamination",
    "test-enquiries",
    junkEnquiries.length === 0
      ? "none"
      : junkEnquiries.map((e) => `${e.id}:${e.source}`).join(", ")
  );

  const notesJunk = await prisma.consult.count({
    where: {
      practiceId,
      OR: [
        { notes: { contains: "E2E", mode: "insensitive" } },
        { notes: { contains: "playwright", mode: "insensitive" } },
        { notes: { contains: "UAT test", mode: "insensitive" } },
      ],
    },
  });
  record(
    notesJunk === 0 ? "PASS" : "WARN",
    "contamination",
    "test-notes-on-consults",
    String(notesJunk)
  );

  const orphanConsults = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM flow_consults c
     WHERE c."practiceId" = $1
       AND NOT EXISTS (SELECT 1 FROM flow_enquiries e WHERE e.id = c."enquiryId")`,
    practiceId
  );
  const orphanN = Number(orphanConsults[0]?.count ?? 0);
  record(orphanN === 0 ? "PASS" : "FAIL", "integrity", "orphan-consults", String(orphanN));

  // Financial sanity: converted should generally have paid or deposit or ACCEPTED
  const convertedNoMoney = await prisma.consult.count({
    where: {
      practiceId,
      outcome: "ACCEPTED",
      totalPaidPence: 0,
      hasDeposit: false,
      treatmentBooked: false,
    },
  });
  record(
    "PASS",
    "consults",
    "accepted-without-deposit-or-paid",
    `${convertedNoMoney} (may be status-only conversions — informational)`
  );

  // Reporting self-check
  const { getConversionReport } = await import("../apps/flow/lib/flow-service");
  const report = await getConversionReport(practiceId);
  if (
    report.totalConsultations === consultCount &&
    report.converted === (await getFlowDashboard(practiceId)).stats.converted
  ) {
    record(
      "PASS",
      "reporting",
      "matches-dashboard",
      `consults=${report.totalConsultations} converted=${report.converted} rate=${report.conversionRate}%`
    );
  } else {
    record(
      "WARN",
      "reporting",
      "vs-dashboard",
      `report consults=${report.totalConsultations} converted=${report.converted}`
    );
  }

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
  const outPath = join(outDir, "flow-data-consistency.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        practiceId,
        auditedAt: new Date().toISOString(),
        summary: {
          pass: findings.filter((f) => f.severity === "PASS").length,
          warn: warns.length,
          fail: fails.length,
        },
        findings,
        junkPatientIds: junkPatients.map((p) => p.id),
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
  process.exit(1);
});
