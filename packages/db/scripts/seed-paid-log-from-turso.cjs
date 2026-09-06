/**
 * Seed PaidInvoiceLineLog from AuraPay Turso May (or PERIOD) private_patients_json.
 * Fills the gap where Elio LOCKED lines lack dentallyInvoiceId.
 *
 * Default dry-run. Pass --execute to write.
 *   node packages/db/scripts/seed-paid-log-from-turso.cjs [--period=2026-05] [--execute]
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

const EXECUTE = process.argv.includes("--execute");
const periodArg = process.argv.find((a) => a.startsWith("--period="));
const PERIOD = periodArg ? periodArg.split("=")[1] : "2026-05";
const [yearStr, monthStr] = PERIOD.split("-");
const YEAR = Number(yearStr);
const MONTH = Number(monthStr);
const PRACTICE_ID = "seed-practice";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const auraEnv = loadEnvFile(
  path.join(__dirname, "../../../../ElioPay/aurapay/.env.local")
);
const dbEnv = loadEnvFile(path.join(__dirname, "../.env"));
for (const [k, v] of Object.entries(dbEnv)) {
  if (!process.env[k]) process.env[k] = v;
}

function buildLineKey(amountPence) {
  return `amt:${amountPence}`;
}

async function main() {
  if (!auraEnv.TURSO_DATABASE_URL || !auraEnv.TURSO_AUTH_TOKEN) {
    throw new Error("Turso credentials missing");
  }
  const turso = createClient({
    url: auraEnv.TURSO_DATABASE_URL,
    authToken: auraEnv.TURSO_AUTH_TOKEN,
  });
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  const periodRs = await turso.execute({
    sql: "SELECT id FROM pay_periods WHERE year = ? AND month = ?",
    args: [YEAR, MONTH],
  });
  if (!periodRs.rows.length) throw new Error(`No Turso period ${PERIOD}`);
  const tursoPeriodId = Number(periodRs.rows[0].id);

  const entriesRs = await turso.execute({
    sql: `SELECT pe.private_patients_json, d.name AS dentist_name
          FROM payslip_entries pe
          JOIN dentists d ON d.id = pe.dentist_id
          WHERE pe.period_id = ?`,
    args: [tursoPeriodId],
  });

  const elioPeriod = await prisma.payPeriod.findFirst({
    where: {
      practiceId: PRACTICE_ID,
      periodStart: {
        gte: new Date(Date.UTC(YEAR, MONTH - 1, 1)),
        lt: new Date(Date.UTC(YEAR, MONTH, 1)),
      },
      status: "LOCKED",
    },
  });
  if (!elioPeriod) throw new Error(`No LOCKED Elio period for ${PERIOD}`);

  const dentists = await prisma.dentist.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { id: true, name: true },
  });
  const byName = new Map(
    dentists.map((d) => [d.name.trim().toLowerCase(), d.id])
  );

  const candidates = [];
  let skippedNoInvoice = 0;
  let skippedNoDentist = 0;

  for (const row of entriesRs.rows) {
    const dentistName = String(row.dentist_name);
    const dentistId = byName.get(dentistName.trim().toLowerCase());
    if (!dentistId) {
      skippedNoDentist++;
      continue;
    }
    let patients = [];
    try {
      patients = JSON.parse(String(row.private_patients_json || "[]"));
    } catch {
      patients = [];
    }
    for (const p of patients) {
      const invoiceId = String(p.invoiceId || p.invoice_id || "").trim();
      if (!invoiceId) {
        skippedNoInvoice++;
        continue;
      }
      const amountPence = Math.round(Number(p.amount || 0) * 100);
      if (!(amountPence > 0)) continue;
      candidates.push({
        practiceId: PRACTICE_ID,
        payPeriodId: elioPeriod.id,
        dentistId,
        dentallyInvoiceId: invoiceId,
        dentallyLineKey: buildLineKey(amountPence),
        dentallyPatientId: p.patientId ? String(p.patientId) : null,
        treatmentDescription: p.treatment || p.name || null,
        amountPence,
        dentistName,
      });
    }
  }

  // Dedupe by invoice+lineKey
  const seen = new Set();
  const unique = [];
  for (const c of candidates) {
    const k = `${c.dentallyInvoiceId}::${c.dentallyLineKey}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(c);
  }

  const existing = await prisma.paidInvoiceLineLog.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { invoiceId: true, lineKey: true },
  });
  const existingKeys = new Set(
    existing.map((e) => `${e.invoiceId}::${e.lineKey}`)
  );
  const toInsert = unique.filter(
    (c) => !existingKeys.has(`${c.dentallyInvoiceId}::${c.dentallyLineKey}`)
  );

  console.log({
    period: PERIOD,
    elioPeriodId: elioPeriod.id,
    candidates: candidates.length,
    unique: unique.length,
    wouldInsert: toInsert.length,
    alreadyPresent: unique.length - toInsert.length,
    skippedNoInvoice,
    skippedNoDentist,
    sample: toInsert.slice(0, 5).map((c) => ({
      dentist: c.dentistName,
      inv: c.dentallyInvoiceId,
      amt: c.amountPence,
    })),
  });

  if (!EXECUTE) {
    console.log("Dry-run only. Re-run with --execute to write.");
    await prisma.$disconnect();
    return;
  }

  let inserted = 0;
  for (const c of toInsert) {
    await prisma.paidInvoiceLineLog.create({
      data: {
        practiceId: c.practiceId,
        payPeriodId: c.payPeriodId,
        dentistId: c.dentistId,
        invoiceId: c.dentallyInvoiceId,
        lineKey: c.dentallyLineKey,
        amountPence: c.amountPence,
      },
    });
    inserted++;
  }
  console.log(`Inserted ${inserted} paid-log rows.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
