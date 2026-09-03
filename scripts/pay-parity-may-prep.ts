/**
 * Export May 2026 (or PERIOD=YYYY-MM) AuraPay net pays from Turso + patch ELIO dentist UDA rates.
 * Then hydrate existing empty May PayPeriod payslips from archive and calculate.
 *
 * Safe: no new PayPeriod rows; no seed.
 *
 * Usage:
 *   PERIOD=2026-05 PRACTICE_ID=seed-practice npx tsx scripts/pay-parity-may-prep.ts
 *   PERIOD=2026-05 PRACTICE_ID=seed-practice npx tsx scripts/pay-parity-may-prep.ts --execute
 */
import { createClient } from "@libsql/client";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { prisma } from "@elio/db";
import {
  calculateLegacyAuraPayNetPayPence,
} from "../apps/pay/lib/pay-period-parity";
import { legacyPayslipLabBills, legacyPayslipAdjustments } from "../apps/pay/lib/legacy-payslip-archive";

const EXECUTE = process.argv.includes("--execute");
const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";
const PERIOD = process.env.PERIOD?.trim() || "2026-05";
const [yearStr, monthStr] = PERIOD.split("-");
const YEAR = Number(yearStr);
const MONTH = Number(monthStr);

function loadAuraPayEnv() {
  const envPath = resolve(__dirname, "../../ElioPay/aurapay/.env.local");
  if (!existsSync(envPath)) throw new Error(`Missing ${envPath}`);
  const raw = readFileSync(envPath, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="([^"]*)"$/) || line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}

async function main() {
  const env = loadAuraPayEnv();
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) throw new Error("Turso env missing");

  const turso = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

  console.log(`\nPay parity prep — period=${PERIOD} practice=${PRACTICE_ID} execute=${EXECUTE}\n`);

  // --- 1) Dentists from Turso ---
  const dentistsRs = await turso.execute("SELECT id, name, split_percentage, is_nhs, uda_rate FROM dentists WHERE active = 1");
  const tursoDentists = dentistsRs.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    splitPercent: Number(r.split_percentage),
    isNhs: Number(r.is_nhs) === 1,
    udaRatePounds: Number(r.uda_rate) || 0,
  }));
  console.log(`Turso dentists: ${tursoDentists.length}`);

  // --- 2) Period + payslip entries from Turso ---
  const periodRs = await turso.execute({
    sql: "SELECT id FROM pay_periods WHERE year = ? AND month = ?",
    args: [YEAR, MONTH],
  });
  if (periodRs.rows.length === 0) throw new Error(`No Turso pay_period for ${PERIOD}`);
  const tursoPeriodId = Number(periodRs.rows[0]!.id);

  const entriesRs = await turso.execute({
    sql: `SELECT pe.*, d.name AS dentist_name, d.split_percentage, d.is_nhs, d.uda_rate
          FROM payslip_entries pe
          JOIN dentists d ON d.id = pe.dentist_id
          WHERE pe.period_id = ?`,
    args: [tursoPeriodId],
  });

  const legacyEntries: { dentistName: string; netPayPounds: number }[] = [];
  for (const row of entriesRs.rows) {
    const patientData = (() => {
      try {
        return JSON.parse(String(row.private_patients_json || "[]")) as { amount?: number; financeFee?: number }[];
      } catch {
        return [];
      }
    })();
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
    legacyEntries.push({
      dentistName: String(row.dentist_name),
      netPayPounds: netPence / 100,
    });
  }

  mkdirSync(join(process.cwd(), "parity-exports"), { recursive: true });
  const exportPath = join(process.cwd(), "parity-exports", `legacy-pay-${PERIOD}.json`);
  writeFileSync(
    exportPath,
    JSON.stringify({ period: PERIOD, source: "turso+auraPayFormula", entries: legacyEntries }, null, 2)
  );
  console.log(`Wrote ${exportPath} (${legacyEntries.length} dentists)`);
  for (const e of legacyEntries) {
    console.log(`  ${e.dentistName}: £${e.netPayPounds.toFixed(2)}`);
  }

  // --- 3) Patch ELIO dentist UDA rates (match by name) ---
  const elioDentists = await prisma.dentist.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { id: true, name: true, udaRatePence: true, privateSplitPercent: true },
  });

  let udaPatched = 0;
  for (const td of tursoDentists) {
    const match = elioDentists.find((d) => d.name.trim().toLowerCase() === td.name.trim().toLowerCase());
    if (!match) {
      console.log(`  no ELIO dentist match for "${td.name}"`);
      continue;
    }
    const udaRatePence = td.udaRatePounds > 0 ? Math.round(td.udaRatePounds * 100) : null;
    if (match.udaRatePence === udaRatePence) continue;
    console.log(`  patch UDA ${match.name}: ${match.udaRatePence} → ${udaRatePence}`);
    if (EXECUTE) {
      await prisma.dentist.update({
        where: { id: match.id },
        data: { udaRatePence },
      });
    }
    udaPatched++;
  }
  console.log(`UDA patches: ${udaPatched}`);

  // --- 4) Find existing ELIO May period (do not create) ---
  const periodStart = new Date(Date.UTC(YEAR, MONTH - 1, 1));
  const periodEnd = new Date(Date.UTC(YEAR, MONTH, 1));
  const payPeriod = await prisma.payPeriod.findFirst({
    where: {
      practiceId: PRACTICE_ID,
      periodStart: { gte: periodStart, lt: new Date(Date.UTC(YEAR, MONTH - 1, 2)) },
    },
    include: { payslipEntries: true },
  });

  // Broader match by month
  const payPeriodAlt =
    payPeriod ??
    (await prisma.payPeriod.findFirst({
      where: {
        practiceId: PRACTICE_ID,
        periodStart: { gte: periodStart, lt: periodEnd },
      },
      include: { payslipEntries: true },
    }));

  if (!payPeriodAlt) {
    console.log("⚠ No ELIO PayPeriod for this month — cannot hydrate. List periods and stop.");
    const all = await prisma.payPeriod.findMany({
      where: { practiceId: PRACTICE_ID },
      select: { id: true, periodStart: true, periodEnd: true, status: true, _count: { select: { payslipEntries: true } } },
      orderBy: { periodStart: "asc" },
    });
    console.log(JSON.stringify(all, null, 2));
    await prisma.$disconnect();
    return;
  }

  console.log(
    `ELIO period ${payPeriodAlt.id} status=${payPeriodAlt.status} payslips=${payPeriodAlt.payslipEntries.length}`
  );

  // --- 5) Hydrate from Neon archive (same period) ---
  const archives = await prisma.legacyPayslipArchive.findMany({
    where: { practiceId: PRACTICE_ID, periodYear: YEAR, periodMonth: MONTH },
  });
  console.log(`Archive rows: ${archives.length}`);

  if (EXECUTE && payPeriodAlt.status === "LOCKED") {
    await prisma.payPeriod.update({
      where: { id: payPeriodAlt.id },
      data: { status: "DRAFT" },
    });
    console.log("Unlocked period for recalculation");
  }

  let hydrated = 0;
  for (const arch of archives) {
    const raw = JSON.parse(arch.rawRowJson) as Record<string, unknown>;
    const dentist = elioDentists.find((d) => d.name.trim().toLowerCase() === arch.dentistName.trim().toLowerCase());
    if (!dentist) {
      console.log(`  skip archive "${arch.dentistName}" — no dentist`);
      continue;
    }

    const tursoDentist = tursoDentists.find((d) => d.name.trim().toLowerCase() === arch.dentistName.trim().toLowerCase());
    const labBills = legacyPayslipLabBills({ lab_bills_json: String(raw.lab_bills_json || "[]") });
    const adjustments = legacyPayslipAdjustments({ adjustments_json: String(raw.adjustments_json || "[]") });
    const patients = (() => {
      try {
        return JSON.parse(String(raw.private_patients_json || "[]")) as {
          amount?: number;
          financeFee?: number;
          name?: string;
          date?: string;
        }[];
      } catch {
        return [];
      }
    })();

    const grossPrivatePounds =
      patients.length > 0
        ? patients.reduce((s, p) => s + (p.amount || 0), 0)
        : Number(raw.gross_private) || 0;
    const grossPrivateRevenuePence = Math.round(grossPrivatePounds * 100);
    const splitPercent = tursoDentist?.splitPercent ?? Number(dentist.privateSplitPercent ?? 50);
    const privateEarningsPence = Math.round((grossPrivateRevenuePence * splitPercent) / 100);
    const udaRatePence = tursoDentist && tursoDentist.udaRatePounds > 0 ? Math.round(tursoDentist.udaRatePounds * 100) : 0;
    const udas = Number(raw.nhs_udas) || 0;
    const isNhs = tursoDentist?.isNhs ?? true;
    const nhsEarningsPence = isNhs ? Math.round(udas * udaRatePence) : 0;
    const labTotalPounds = labBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const labDeductionPence = Math.round(labTotalPounds * 0.5 * 100);
    const therapyMinutes = Number(raw.therapy_minutes) || 0;
    const therapyRate = Number(raw.therapy_rate) || 0.5833;
    const therapyDeduction = Math.round(therapyMinutes * (therapyRate > 0 ? therapyRate : 0.5833) * 100);
    const financeFees =
      patients.length > 0
        ? patients.reduce((s, p) => s + (p.financeFee || 0), 0)
        : Number(raw.finance_fees) || 0;
    const financeDeductionPence = Math.round(financeFees * 0.5 * 100);
    const superannuationPence = Math.round((Number(raw.superannuation_deduction) || 0) * 100);
    let adjPence = 0;
    for (const adj of adjustments) {
      const amount = Math.round((Number(adj.amount) || 0) * 100);
      adjPence += adj.type === "addition" ? amount : -amount;
    }

    const finalPayPence =
      nhsEarningsPence +
      privateEarningsPence -
      labDeductionPence -
      superannuationPence -
      therapyDeduction -
      financeDeductionPence +
      adjPence;

    if (EXECUTE) {
      const entry = await prisma.payslipEntry.upsert({
        where: {
          payPeriodId_dentistId: { payPeriodId: payPeriodAlt.id, dentistId: dentist.id },
        },
        create: {
          practiceId: PRACTICE_ID,
          payPeriodId: payPeriodAlt.id,
          dentistId: dentist.id,
          payType: "PERCENTAGE_SPLIT",
          udas,
          udaRatePence,
          nhsEarningsPence,
          grossPrivateRevenuePence,
          privateSplitPercent: splitPercent,
          privateEarningsPence,
          consultationExclusionsPence: 0,
          labDeductionPence,
          superannuationPence,
          therapyMinutes,
          therapyRatePerMinute: therapyRate,
          labBillsJson: labBills,
          adjustmentsJson: adjustments,
          manualAdjustmentsPence: adjPence,
          finalPayPence,
          dentallyPatientsJson: patients,
        },
        update: {
          udas,
          udaRatePence,
          nhsEarningsPence,
          grossPrivateRevenuePence,
          privateSplitPercent: splitPercent,
          privateEarningsPence,
          labDeductionPence,
          superannuationPence,
          therapyMinutes,
          therapyRatePerMinute: therapyRate,
          labBillsJson: labBills,
          adjustmentsJson: adjustments,
          manualAdjustmentsPence: adjPence,
          finalPayPence,
          dentallyPatientsJson: patients,
        },
      });

      // Replace private revenue lines from archive patients
      await prisma.privateRevenueLineItem.deleteMany({ where: { payslipEntryId: entry.id } });
      for (const p of patients) {
        const amountPence = Math.round((p.amount || 0) * 100);
        if (amountPence <= 0) continue;
        await prisma.privateRevenueLineItem.create({
          data: {
            payslipEntryId: entry.id,
            amountPence,
            excludedAsConsultation: false,
            patientName: p.name ?? null,
            invoiceDate: p.date ?? null,
            financeFeePence: p.financeFee != null ? Math.round(p.financeFee * 100) : null,
          },
        });
      }
    }
    hydrated++;
    console.log(`  hydrate ${arch.dentistName}: final £${(finalPayPence / 100).toFixed(2)}`);
  }

  console.log(`Hydrated ${hydrated} payslips`);

  writeFileSync(
    join(process.cwd(), "parity-exports", `pay-parity-prep-${PERIOD}.json`),
    JSON.stringify(
      {
        period: PERIOD,
        payPeriodId: payPeriodAlt.id,
        exportPath,
        udaPatched,
        hydrated,
        execute: EXECUTE,
        legacyEntries,
      },
      null,
      2
    )
  );

  if (!EXECUTE) console.log("\nDRY RUN — re-run with --execute to write.\n");
  else {
    console.log(`\nNext:\n  PRACTICE_ID=${PRACTICE_ID} PAY_PERIOD_ID=${payPeriodAlt.id} LEGACY_PAY_EXPORT_PATH=${exportPath} npm run verify:pay-parity\n`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
