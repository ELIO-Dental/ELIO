/**
 * Client data-correctness audit for ElioPay (addresses "data not correct" report).
 * 1) Fresh Turso AuraPay May net pays
 * 2) Compare to Elio LOCKED May payslips (±£1)
 * 3) Home "total owed this period" = sum of that period's finals
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const auraEnv = loadEnv(path.join(__dirname, "../../ElioPay/aurapay/.env.local"));
const dbEnv = loadEnv(path.join(__dirname, "../packages/db/.env"));
for (const [k, v] of Object.entries(dbEnv)) {
  if (!process.env[k]) process.env[k] = v;
}

const PRACTICE_ID = "seed-practice";
const TOLERANCE_PENCE = 100;
const PERIOD = "2026-05";
const YEAR = 2026;
const MONTH = 5;

function isActiveName(name) {
  return !String(name).startsWith("[REMOVED]") && !String(name).startsWith("[UAT]") && !/angelica/i.test(name);
}

async function main() {
  const { calculateLegacyAuraPayNetPayPence } = await import("../apps/pay/lib/pay-period-parity.ts");
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  if (!auraEnv.TURSO_DATABASE_URL || !auraEnv.TURSO_AUTH_TOKEN) {
    throw new Error("Turso credentials missing");
  }
  const turso = createClient({
    url: auraEnv.TURSO_DATABASE_URL,
    authToken: auraEnv.TURSO_AUTH_TOKEN,
  });

  console.log("\n=== ElioPay data correctness audit ===\n");

  // --- 1) Fresh AuraPay nets from Turso ---
  const periodRs = await turso.execute({
    sql: "SELECT id FROM pay_periods WHERE year = ? AND month = ?",
    args: [YEAR, MONTH],
  });
  if (!periodRs.rows.length) throw new Error("No Turso May period");
  const tursoPeriodId = Number(periodRs.rows[0].id);

  const entriesRs = await turso.execute({
    sql: `SELECT pe.*, d.name AS dentist_name, d.split_percentage, d.is_nhs, d.uda_rate
          FROM payslip_entries pe
          JOIN dentists d ON d.id = pe.dentist_id
          WHERE pe.period_id = ?`,
    args: [tursoPeriodId],
  });

  const legacyByName = new Map();
  for (const row of entriesRs.rows) {
    const name = String(row.dentist_name);
    if (!isActiveName(name)) continue;
    let patientData = [];
    try {
      patientData = JSON.parse(String(row.private_patients_json || "[]"));
    } catch {
      patientData = [];
    }
    const grossPrivate =
      patientData.length > 0
        ? patientData.reduce((s, p) => s + (p.amount || 0), 0)
        : Number(row.gross_private) || 0;
    const financeFees =
      patientData.length > 0
        ? patientData.reduce((s, p) => s + (p.financeFee || 0), 0)
        : Number(row.finance_fees) || 0;

    const netPence = calculateLegacyAuraPayNetPayPence({
      grossPrivatePounds: grossPrivate,
      splitPercent: Number(row.split_percentage),
      isNhs: Number(row.is_nhs) === 1,
      nhsUdas: Number(row.nhs_udas) || 0,
      udaRatePounds: Number(row.uda_rate) || 0,
      labBillsJson: String(row.lab_bills_json || "[]"),
      financeFeesPounds: financeFees,
      therapyMinutes: Number(row.therapy_minutes) || 0,
      therapyRatePerMinute: Number(row.therapy_rate) || 0.5833,
      superannuationPounds: Number(row.superannuation_deduction) || 0,
      adjustmentsJson: String(row.adjustments_json || "[]"),
    });
    legacyByName.set(name.trim().toLowerCase(), {
      name,
      netPence,
      grossPrivate,
      financeFees,
      nhsUdas: Number(row.nhs_udas) || 0,
      therapyMinutes: Number(row.therapy_minutes) || 0,
    });
  }
  console.log(`Turso AuraPay dentists (active): ${legacyByName.size}`);

  // --- 2) Elio May LOCKED payslips ---
  const elioPeriod = await prisma.payPeriod.findFirst({
    where: {
      practiceId: PRACTICE_ID,
      periodStart: {
        gte: new Date(Date.UTC(YEAR, MONTH - 1, 1)),
        lt: new Date(Date.UTC(YEAR, MONTH, 1)),
      },
      status: "LOCKED",
    },
    include: {
      payslipEntries: { include: { dentist: true } },
    },
  });
  if (!elioPeriod) throw new Error("No LOCKED Elio May period");

  const elioEntries = elioPeriod.payslipEntries.filter((e) => isActiveName(e.dentist.name));
  console.log(`Elio May period: ${elioPeriod.id} payslips=${elioEntries.length}`);

  let allOk = true;
  console.log("\n--- Per-dentist ±£1 ---");
  console.log(
    "Dentist".padEnd(24) +
      "Aura £".padStart(12) +
      "Elio £".padStart(12) +
      "Diff £".padStart(10) +
      "  OK"
  );
  for (const e of elioEntries) {
    const key = e.dentist.name.trim().toLowerCase();
    const legacy = legacyByName.get(key);
    const elioPence = e.finalPayPence ?? 0;
    if (!legacy) {
      console.log(`${e.dentist.name.padEnd(24)} MISSING IN AURA`);
      allOk = false;
      continue;
    }
    const diff = Math.abs(elioPence - legacy.netPence);
    const ok = diff <= TOLERANCE_PENCE;
    if (!ok) allOk = false;
    console.log(
      e.dentist.name.padEnd(24) +
        (legacy.netPence / 100).toFixed(2).padStart(12) +
        (elioPence / 100).toFixed(2).padStart(12) +
        (diff / 100).toFixed(2).padStart(10) +
        (ok ? "  ✓" : "  ✗")
    );
  }
  for (const [key, legacy] of legacyByName) {
    if (!elioEntries.some((e) => e.dentist.name.trim().toLowerCase() === key)) {
      console.log(`${legacy.name.padEnd(24)} MISSING IN ELIO (Aura £${(legacy.netPence / 100).toFixed(2)})`);
      // Zero Aura pays with no Elio row are OK if dentist inactive; flag non-zero
      if (legacy.netPence !== 0) allOk = false;
    }
  }

  // --- 3) Home dashboard formula ---
  const homeTotal = elioEntries.reduce((s, e) => s + (e.finalPayPence ?? 0), 0);
  const auraTotal = [...legacyByName.values()].reduce((s, e) => s + e.netPence, 0);
  const homeDiff = Math.abs(homeTotal - auraTotal);
  const homeOk = homeDiff <= TOLERANCE_PENCE * Math.max(elioEntries.length, 1);
  console.log("\n--- Home 'Total owed this period' ---");
  console.log(`Elio sum finals: £${(homeTotal / 100).toFixed(2)}`);
  console.log(`Aura sum nets:   £${(auraTotal / 100).toFixed(2)}`);
  console.log(`Diff:            £${(homeDiff / 100).toFixed(2)} ${homeOk ? "✓" : "✗"}`);
  if (!homeOk) allOk = false;

  // --- 4) Paid log anti-double-pay ---
  const paidLog = await prisma.paidInvoiceLineLog.count({
    where: { practiceId: PRACTICE_ID, payPeriodId: elioPeriod.id },
  });
  console.log(`\n--- Paid invoice log (May) ---`);
  console.log(`Rows for May period: ${paidLog} ${paidLog > 0 ? "✓" : "✗ (empty)"}`);
  if (paidLog === 0) allOk = false;

  // Write fresh export for verify:pay-parity
  const exportPath = path.join(__dirname, "../parity-exports/legacy-pay-2026-05.json");
  fs.writeFileSync(
    exportPath,
    JSON.stringify(
      {
        period: PERIOD,
        source: "turso+auraPayFormula-fresh",
        auditedAt: new Date().toISOString(),
        entries: [...legacyByName.values()].map((e) => ({
          dentistName: e.name,
          netPayPounds: e.netPence / 100,
        })),
      },
      null,
      2
    )
  );
  console.log(`\nWrote fresh export: ${exportPath}`);

  console.log(`\n=== RESULT: ${allOk ? "DATA CORRECT ✓" : "MISMATCHES FOUND ✗"} ===\n`);
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
