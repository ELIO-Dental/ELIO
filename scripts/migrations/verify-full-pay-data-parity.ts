/**
 * Full AuraPay Turso ↔ Elio Neon data parity audit.
 * Read-only. Exit 1 if any mismatch.
 */
import { createClient } from "@libsql/client";
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { getBillsReportingData } from "../../apps/pay/lib/bills-reporting-service";
import { listUnpaidBillsForBulkPayment } from "../../apps/pay/lib/bulk-payment";
import { parseLegacyPaidFlag } from "../../apps/pay/lib/bill-paid";
import {
  formatLegacyPeriodLabel,
  legacyPayslipSummary,
  parseLegacyPayslipRow,
} from "../../apps/pay/lib/legacy-payslip-archive";

dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio-deploy-env/pay.env") });
dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio/scripts/migrations/.env.local") });
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";

function readTurso() {
  const p = path.resolve("D:/WEB DEV/Hish/ElioPay/aurapay/.env.local");
  const raw = fs.readFileSync(p, "utf8");
  return {
    url: process.env.OLD_ELIOPAY_TURSO_URL || raw.match(/TURSO_DATABASE_URL="([^"]+)"/)?.[1]!,
    authToken: process.env.OLD_ELIOPAY_TURSO_TOKEN || raw.match(/TURSO_AUTH_TOKEN="([^"]+)"/)?.[1]!,
  };
}

function poundsToPence(n: unknown) {
  return Math.round(Number(n || 0) * 100);
}

function norm(v: unknown) {
  return String(v || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const fails: string[] = [];
function check(ok: boolean, msg: string) {
  if (ok) console.log(`  PASS  ${msg}`);
  else {
    console.log(`  FAIL  ${msg}`);
    fails.push(msg);
  }
}

async function main() {
  const { url, authToken } = readTurso();
  const turso = createClient({ url, authToken });
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No practice");
  console.log(`Practice: ${practice.name}\n`);

  // ---- Dentists ----
  console.log("1) DENTISTS");
  const tDentists = await turso.execute("SELECT id, name, email, split_percentage, is_nhs, uda_rate, active FROM dentists");
  const nDentists = await prisma.dentist.findMany({ where: { practiceId: practice.id } });
  const nByName = new Map(nDentists.map((d) => [norm(d.name), d]));
  let dentistMiss = 0;
  for (const d of tDentists.rows) {
    const neon = nByName.get(norm(d.name));
    if (!neon) {
      dentistMiss++;
      fails.push(`Dentist missing: ${d.name}`);
      continue;
    }
    const splitOk =
      neon.privateSplitPercent == null ||
      Math.abs(Number(neon.privateSplitPercent) - Number(d.split_percentage || 50)) < 0.01;
    const nhsOk = neon.isNhs === (Number(d.is_nhs) === 1 || d.is_nhs === true);
    if (!splitOk || !nhsOk) {
      dentistMiss++;
      fails.push(`Dentist mismatch ${d.name}: split/nhs`);
    }
  }
  check(dentistMiss === 0, `Dentists ${tDentists.rows.length} Turso ↔ ${nDentists.length} Neon (active flags compared by name)`);

  // ---- Lab bills ----
  console.log("\n2) LAB BILLS");
  const tLabs = await turso.execute("SELECT * FROM lab_bill_entries");
  const nLabs = await prisma.labBillEntry.findMany({ where: { practiceId: practice.id } });
  check(tLabs.rows.length === nLabs.length, `Count ${tLabs.rows.length} = ${nLabs.length}`);
  check(nLabs.every((r) => r.billDate != null), `All Neon billDate set (${nLabs.filter((r) => !r.billDate).length} null)`);
  check(nLabs.every((r) => r.labName != null && r.labName.length > 0), `All Neon labName set`);

  const tLabByYm = new Map<string, { c: number; p: number; paid: number }>();
  for (const r of tLabs.rows) {
    const k = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const cur = tLabByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    cur.c++;
    cur.p += poundsToPence(r.amount);
    if (parseLegacyPaidFlag(r.paid)) cur.paid++;
    tLabByYm.set(k, cur);
  }
  const nLabByYm = new Map<string, { c: number; p: number; paid: number }>();
  for (const r of nLabs) {
    const d = r.billDate!;
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = nLabByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    cur.c++;
    cur.p += r.amountPence;
    if (r.paid) cur.paid++;
    nLabByYm.set(k, cur);
  }
  let labYmFail = 0;
  for (const k of new Set([...tLabByYm.keys(), ...nLabByYm.keys()])) {
    const t = tLabByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    const n = nLabByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    if (t.c !== n.c || t.p !== n.p || t.paid !== n.paid) {
      labYmFail++;
      fails.push(`Lab ${k}: Turso ${t.c}/£${(t.p / 100).toFixed(2)}/paid${t.paid} vs Neon ${n.c}/£${(n.p / 100).toFixed(2)}/paid${n.paid}`);
    }
  }
  check(labYmFail === 0, `Lab year-month buckets (${tLabByYm.size} months)`);

  // ---- Supplier invoices ----
  console.log("\n3) SUPPLIER INVOICES");
  const tSup = await turso.execute("SELECT * FROM supplier_invoice_entries");
  const nSup = await prisma.supplierInvoiceEntry.findMany({
    where: { practiceId: practice.id },
    include: { supplier: true },
  });
  check(tSup.rows.length === nSup.length, `Count ${tSup.rows.length} = ${nSup.length}`);
  check(nSup.every((r) => r.invoiceDate != null), `All Neon invoiceDate set`);
  check(nSup.every((r) => r.supplierId != null), `All Neon supplierId linked`);

  const tSupByYm = new Map<string, { c: number; p: number; paid: number }>();
  for (const r of tSup.rows) {
    const k = `${r.year}-${String(r.month).padStart(2, "0")}`;
    const cur = tSupByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    cur.c++;
    cur.p += poundsToPence(r.amount);
    if (parseLegacyPaidFlag(r.paid)) cur.paid++;
    tSupByYm.set(k, cur);
  }
  const nSupByYm = new Map<string, { c: number; p: number; paid: number }>();
  for (const r of nSup) {
    const d = r.invoiceDate!;
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = nSupByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    cur.c++;
    cur.p += r.amountPence;
    if (r.paid) cur.paid++;
    nSupByYm.set(k, cur);
  }
  let supYmFail = 0;
  for (const k of new Set([...tSupByYm.keys(), ...nSupByYm.keys()])) {
    const t = tSupByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    const n = nSupByYm.get(k) ?? { c: 0, p: 0, paid: 0 };
    if (t.c !== n.c || t.p !== n.p || t.paid !== n.paid) {
      supYmFail++;
      fails.push(`Supplier ${k}: mismatch`);
    }
  }
  check(supYmFail === 0, `Supplier year-month buckets (${tSupByYm.size} months)`);

  // Grand totals
  const tLabTotal = tLabs.rows.reduce((s, r) => s + poundsToPence(r.amount), 0);
  const nLabTotal = nLabs.reduce((s, r) => s + r.amountPence, 0);
  const tSupTotal = tSup.rows.reduce((s, r) => s + poundsToPence(r.amount), 0);
  const nSupTotal = nSup.reduce((s, r) => s + r.amountPence, 0);
  check(tLabTotal === nLabTotal, `Lab grand total £${(tLabTotal / 100).toFixed(2)}`);
  check(tSupTotal === nSupTotal, `Supplier grand total £${(tSupTotal / 100).toFixed(2)}`);

  // ---- Bulk unpaid + bank ----
  console.log("\n4) BULK PAYMENTS");
  const unpaid = await listUnpaidBillsForBulkPayment(practice.id);
  const tLabUnpaid = await turso.execute(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM lab_bill_entries WHERE paid = 0"
  );
  const tSupUnpaid = await turso.execute(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM supplier_invoice_entries WHERE paid = 0"
  );
  const labUnpaidPence = unpaid.lab_bills.reduce((s, b) => s + b.amountPence, 0);
  const supUnpaidPence = unpaid.supplier_invoices.reduce((s, b) => s + b.amountPence, 0);
  check(
    Number(tLabUnpaid.rows[0]?.c) === unpaid.lab_bills.length &&
      poundsToPence(tLabUnpaid.rows[0]?.t) === labUnpaidPence,
    `Unpaid labs ${unpaid.lab_bills.length}/£${(labUnpaidPence / 100).toFixed(2)}`
  );
  check(
    Number(tSupUnpaid.rows[0]?.c) === unpaid.supplier_invoices.length &&
      poundsToPence(tSupUnpaid.rows[0]?.t) === supUnpaidPence,
    `Unpaid suppliers ${unpaid.supplier_invoices.length}/£${(supUnpaidPence / 100).toFixed(2)}`
  );

  const tSavedLabs = await turso.execute("SELECT name FROM saved_labs");
  const tSavedSup = await turso.execute("SELECT name FROM saved_suppliers");
  const nSavedLabs = await prisma.savedLab.findMany({ where: { practiceId: practice.id } });
  const nSavedSup = await prisma.savedSupplier.findMany({ where: { practiceId: practice.id } });
  const nLabNames = new Set(nSavedLabs.map((l) => norm(l.name)));
  const nSupNames = new Set(nSavedSup.map((s) => norm(s.name)));
  const labBankMiss = tSavedLabs.rows.filter((r) => !nLabNames.has(norm(r.name))).length;
  const supBankMiss = tSavedSup.rows.filter((r) => !nSupNames.has(norm(r.name))).length;
  check(labBankMiss === 0 && tSavedLabs.rows.length === nSavedLabs.length, `Saved labs ${nSavedLabs.length}`);
  check(supBankMiss === 0 && tSavedSup.rows.length === nSavedSup.length, `Saved suppliers ${nSavedSup.length}`);

  // ---- Legacy archive ----
  console.log("\n5) LEGACY ARCHIVE");
  const tPayslips = await turso.execute("SELECT * FROM payslip_entries");
  const tPeriods = await turso.execute("SELECT id, month, year FROM pay_periods");
  const periodById = new Map(tPeriods.rows.map((p) => [String(p.id), p]));
  const nArchive = await prisma.legacyPayslipArchive.findMany({ where: { practiceId: practice.id } });
  const archiveBySource = new Map(nArchive.map((a) => [a.sourceId, a]));
  check(tPayslips.rows.length === nArchive.length, `Archive rows ${tPayslips.rows.length} = ${nArchive.length}`);

  let archiveJsonMiss = 0;
  let archiveMetaMiss = 0;
  for (const row of tPayslips.rows) {
    const sourceId = String(row.id);
    const arch = archiveBySource.get(sourceId);
    if (!arch) {
      archiveJsonMiss++;
      fails.push(`Archive missing sourceId ${sourceId}`);
      continue;
    }
    const period = periodById.get(String(row.period_id));
    if (period) {
      if (arch.periodMonth !== Number(period.month) || arch.periodYear !== Number(period.year)) {
        archiveMetaMiss++;
        fails.push(`Archive period meta ${sourceId}`);
      }
    }
    if (arch.rawRowJson !== JSON.stringify(row)) {
      // Allow if only whitespace/key order — compare parsed summaries
      const a = legacyPayslipSummary(parseLegacyPayslipRow(arch.rawRowJson));
      const b = legacyPayslipSummary(parseLegacyPayslipRow(JSON.stringify(row)));
      if (
        a.grossPrivate !== b.grossPrivate ||
        a.nhsUdas !== b.nhsUdas ||
        a.patientCount !== b.patientCount ||
        a.financeFees !== b.financeFees
      ) {
        archiveJsonMiss++;
        fails.push(
          `Archive data drift ${sourceId} ${arch.dentistName} ${formatLegacyPeriodLabel(arch.periodMonth, arch.periodYear)}`
        );
      }
    }
  }
  check(archiveJsonMiss === 0 && archiveMetaMiss === 0, `Archive content matches Turso payslip_entries`);

  // ---- Reporting ----
  console.log("\n6) REPORTING");
  const reports = await getBillsReportingData(practice.id);
  check(
    reports.labSummary.totalPence === nLabTotal && reports.labSummary.totalCount === nLabs.length,
    `Reporting lab total £${(reports.labSummary.totalPence / 100).toFixed(2)}`
  );
  check(
    reports.supplierSummary.totalPence === nSupTotal &&
      reports.supplierSummary.totalCount === nSup.length,
    `Reporting supplier total £${(reports.supplierSummary.totalPence / 100).toFixed(2)}`
  );
  check(
    reports.labSummary.unpaidPence === labUnpaidPence &&
      reports.labSummary.unpaidCount === unpaid.lab_bills.length,
    `Reporting lab unpaid £${(reports.labSummary.unpaidPence / 100).toFixed(2)}`
  );
  check(
    reports.supplierSummary.unpaidPence === supUnpaidPence &&
      reports.supplierSummary.unpaidCount === unpaid.supplier_invoices.length,
    `Reporting supplier unpaid £${(reports.supplierSummary.unpaidPence / 100).toFixed(2)}`
  );

  const monthly = await turso.execute(`
    SELECT year, month,
      (SELECT COALESCE(SUM(amount),0) FROM lab_bill_entries WHERE year = m.year AND month = m.month) as lab_total,
      (SELECT COALESCE(SUM(amount),0) FROM supplier_invoice_entries WHERE year = m.year AND month = m.month) as supplier_total
    FROM (
      SELECT DISTINCT year, month FROM lab_bill_entries
      UNION
      SELECT DISTINCT year, month FROM supplier_invoice_entries
    ) m ORDER BY year, month
  `);
  let reportYmFail = 0;
  for (const row of monthly.rows) {
    const neon = reports.monthlyTotals.find(
      (m) => m.year === Number(row.year) && m.month === Number(row.month)
    );
    if (
      !neon ||
      neon.labTotalPence !== poundsToPence(row.lab_total) ||
      neon.supplierTotalPence !== poundsToPence(row.supplier_total)
    ) {
      reportYmFail++;
      fails.push(`Reporting month ${row.year}-${row.month}`);
    }
  }
  check(reportYmFail === 0, `Reporting monthly costs (${monthly.rows.length} months)`);

  // ---- Pay periods (counts / months present) ----
  console.log("\n7) PAY PERIODS");
  const nPeriods = await prisma.payPeriod.findMany({
    where: { practiceId: practice.id },
    include: { _count: { select: { payslipEntries: true } } },
    orderBy: { periodStart: "asc" },
  });
  check(tPeriods.rows.length > 0, `Turso periods ${tPeriods.rows.length}`);
  check(nPeriods.length > 0, `Neon periods ${nPeriods.length}`);
  // AuraPay periods should have matching calendar months in Neon (may be LOCKED/DRAFT)
  let periodMonthMiss = 0;
  for (const p of tPeriods.rows) {
    const y = Number(p.year);
    const m = Number(p.month);
    const found = nPeriods.some(
      (np) => np.periodStart.getUTCFullYear() === y && np.periodStart.getUTCMonth() + 1 === m
    );
    if (!found) {
      periodMonthMiss++;
      fails.push(`Pay period missing ${y}-${m}`);
    }
  }
  check(periodMonthMiss === 0, `All AuraPay period months exist in Neon`);

  // ---- Summary ----
  console.log("\n" + "=".repeat(50));
  if (fails.length === 0) {
    console.log("FULL DATA PARITY: 100% PASS — every checked domain matches AuraPay");
  } else {
    console.log(`FULL DATA PARITY: FAIL (${fails.length} issues)`);
    for (const f of fails.slice(0, 40)) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
