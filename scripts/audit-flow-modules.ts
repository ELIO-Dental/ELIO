/**
 * Module-by-module Flow spot-checks after KPI audit passes.
 * Covers every FLOW_MODULE_NAV surface: dashboard, pipeline, reporting,
 * enquiries, reminders, team, practice, settings.
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
  const { listPipeline, getConversionReport, getFlowDashboard } = await import(
    "../apps/flow/lib/flow-service"
  );
  const { getFlowSettings } = await import("@elio/dentally");
  const practiceId = process.env.PRACTICE_ID?.trim() || "seed-practice";

  console.log(`\n=== Elio Flow module audit ===\npractice=${practiceId}\n`);

  // --- Dashboard ---
  const { stats: dash } = await getFlowDashboard(practiceId);
  if (dash.totalConsultations === 819 && dash.converted === 305 && dash.stuck === 501) {
    record(
      "PASS",
      "dashboard",
      "kpis",
      `consults=${dash.totalConsultations} converted=${dash.converted} stuck=${dash.stuck} rate=${dash.conversionRate}%`
    );
  } else {
    record(
      "FAIL",
      "dashboard",
      "kpis",
      `got consults=${dash.totalConsultations} converted=${dash.converted} stuck=${dash.stuck}`
    );
  }
  const paidGbp = Math.round(dash.totalPaidPence / 100);
  const plannedGbp = Math.round(dash.totalPlannedPence / 100);
  const pipelineGbp = Math.round(dash.totalPipelineValuePence / 100);
  if (paidGbp === 1971138 && plannedGbp === 4263121 && pipelineGbp === 3223422) {
    record(
      "PASS",
      "dashboard",
      "financials",
      `paid=£${paidGbp} planned=£${plannedGbp} pipeline=£${pipelineGbp}`
    );
  } else {
    record(
      "FAIL",
      "dashboard",
      "financials",
      `paid=${paidGbp} planned=${plannedGbp} pipeline=${pipelineGbp}`
    );
  }
  if (dash.planSignUps === 2) {
    record("PASS", "dashboard", "elioCare", "2");
  } else {
    record("FAIL", "dashboard", "elioCare", String(dash.planSignUps));
  }

  // --- Pipeline board ---
  const cols = await listPipeline(practiceId);
  const sizes = {
    capture: cols.capture.length,
    consult_quote: cols.consult_quote.length,
    thinking: cols.thinking.length,
    reminders: cols.reminders.length,
    closed: cols.closed.length,
  };
  const boardTotal =
    sizes.capture + sizes.consult_quote + sizes.thinking + sizes.reminders + sizes.closed;
  if (boardTotal === 819) {
    record(
      "PASS",
      "pipeline",
      "board-cards",
      `capture=${sizes.capture} quote=${sizes.consult_quote} thinking=${sizes.thinking} reminders=${sizes.reminders} closed=${sizes.closed} total=${boardTotal}`
    );
  } else {
    record("FAIL", "pipeline", "board-cards", `total=${boardTotal} expected 819`);
  }

  // --- Reporting ---
  const report = await getConversionReport(practiceId);
  if (
    report.totalConsultations === 819 &&
    report.converted === 305 &&
    report.conversionRate === 38
  ) {
    record(
      "PASS",
      "reporting",
      "conversion",
      `consults=${report.totalConsultations} converted=${report.converted} rate=${report.conversionRate}% dentists=${report.byDentist.length}`
    );
  } else {
    record(
      "FAIL",
      "reporting",
      "conversion",
      `consults=${report.totalConsultations} converted=${report.converted} rate=${report.conversionRate}`
    );
  }

  // --- Enquiries ---
  const enquiryTotal = await prisma.enquiry.count({ where: { practiceId } });
  const openEnquiries = await prisma.enquiry.count({
    where: { practiceId, consults: { none: {} } },
  });
  if (enquiryTotal === 819 && openEnquiries === 0) {
    record("PASS", "enquiries", "counts", `total=${enquiryTotal} open=${openEnquiries}`);
  } else {
    record("FAIL", "enquiries", "counts", `total=${enquiryTotal} open=${openEnquiries}`);
  }

  // --- Reminders ---
  const reminderTotal = await prisma.reminder.count({ where: { practiceId } });
  const outstanding = await prisma.reminder.count({
    where: { practiceId, sentAt: null },
  });
  if (reminderTotal === 0 && outstanding === 0) {
    record("PASS", "reminders", "counts", `total=${reminderTotal} outstanding=${outstanding}`);
  } else {
    record("WARN", "reminders", "counts", `total=${reminderTotal} outstanding=${outstanding}`);
  }

  // --- Team ---
  const users = await prisma.user.findMany({
    where: { practiceId },
    select: { id: true, email: true, displayName: true, role: true },
  });
  const dentists = await prisma.dentist.count({ where: { practiceId } });
  if (users.length >= 1 && dentists >= 1) {
    record(
      "PASS",
      "team",
      "roster",
      `users=${users.length} dentists=${dentists} emails=${users.map((u) => u.email).join(",")}`
    );
  } else {
    record("FAIL", "team", "roster", `users=${users.length} dentists=${dentists}`);
  }

  // --- Practice ---
  const practice = await prisma.practice.findUnique({ where: { id: practiceId } });
  if (practice?.name === "Aura Dental Clinic") {
    record("PASS", "practice", "identity", `"${practice.name}" (${practiceId})`);
  } else {
    record("FAIL", "practice", "identity", JSON.stringify(practice?.name ?? null));
  }

  // --- Settings ---
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

  // --- Contamination (all modules) ---
  const junkPatients = await prisma.patient.count({
    where: {
      practiceId,
      OR: [
        { firstName: { contains: "e2e", mode: "insensitive" } },
        { lastName: { contains: "e2e", mode: "insensitive" } },
        { firstName: { contains: "sandbox", mode: "insensitive" } },
        { lastName: { contains: "UAT", mode: "insensitive" } },
        { email: { contains: "e2e@", mode: "insensitive" } },
        { email: { contains: "test+", mode: "insensitive" } },
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
  const outPath = join(outDir, "flow-modules-audit.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        practiceId,
        auditedAt: new Date().toISOString(),
        summary: { pass, warn, fail },
        pipelineBoard: sizes,
        findings,
      },
      null,
      2
    )
  );
  console.log(`Wrote ${outPath}`);

  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
  console.log("MODULE SPOT-CHECKS PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
