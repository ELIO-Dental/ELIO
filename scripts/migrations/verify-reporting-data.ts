/**
 * Verify Reporting aggregates vs AuraPay Turso after lab/supplier sync.
 * Read-only.
 */
import { createClient } from "@libsql/client";
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { getBillsReportingData } from "../../apps/pay/lib/bills-reporting-service";

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

async function main() {
  const { url, authToken } = readTurso();
  const turso = createClient({ url, authToken });
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No practice");

  const reports = await getBillsReportingData(practice.id);

  const labSum = await turso.execute(`
    SELECT COUNT(*) as total_count,
      COALESCE(SUM(amount),0) as total_amount,
      SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) as paid_count,
      COALESCE(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END),0) as paid_amount,
      SUM(CASE WHEN paid = 0 THEN 1 ELSE 0 END) as unpaid_count,
      COALESCE(SUM(CASE WHEN paid = 0 THEN amount ELSE 0 END),0) as unpaid_amount
    FROM lab_bill_entries
  `);
  const supSum = await turso.execute(`
    SELECT COUNT(*) as total_count,
      COALESCE(SUM(amount),0) as total_amount,
      SUM(CASE WHEN paid = 1 THEN 1 ELSE 0 END) as paid_count,
      COALESCE(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END),0) as paid_amount,
      SUM(CASE WHEN paid = 0 THEN 1 ELSE 0 END) as unpaid_count,
      COALESCE(SUM(CASE WHEN paid = 0 THEN amount ELSE 0 END),0) as unpaid_amount
    FROM supplier_invoice_entries
  `);

  const tLab = labSum.rows[0]!;
  const tSup = supSum.rows[0]!;

  console.log("=== REPORTING SUMMARY CARDS ===");
  console.log(
    `Lab total: Turso £${Number(tLab.total_amount).toFixed(2)} (${tLab.total_count})  Neon £${(reports.labSummary.totalPence / 100).toFixed(2)} (${reports.labSummary.totalCount})`
  );
  console.log(
    `Lab unpaid: Turso £${Number(tLab.unpaid_amount).toFixed(2)} (${tLab.unpaid_count})  Neon £${(reports.labSummary.unpaidPence / 100).toFixed(2)} (${reports.labSummary.unpaidCount})`
  );
  console.log(
    `Sup total: Turso £${Number(tSup.total_amount).toFixed(2)} (${tSup.total_count})  Neon £${(reports.supplierSummary.totalPence / 100).toFixed(2)} (${reports.supplierSummary.totalCount})`
  );
  console.log(
    `Sup unpaid: Turso £${Number(tSup.unpaid_amount).toFixed(2)} (${tSup.unpaid_count})  Neon £${(reports.supplierSummary.unpaidPence / 100).toFixed(2)} (${reports.supplierSummary.unpaidCount})`
  );

  const summaryOk =
    poundsToPence(tLab.total_amount) === reports.labSummary.totalPence &&
    Number(tLab.total_count) === reports.labSummary.totalCount &&
    poundsToPence(tLab.unpaid_amount) === reports.labSummary.unpaidPence &&
    Number(tLab.unpaid_count) === reports.labSummary.unpaidCount &&
    poundsToPence(tSup.total_amount) === reports.supplierSummary.totalPence &&
    Number(tSup.total_count) === reports.supplierSummary.totalCount &&
    poundsToPence(tSup.unpaid_amount) === reports.supplierSummary.unpaidPence &&
    Number(tSup.unpaid_count) === reports.supplierSummary.unpaidCount;

  const monthly = await turso.execute(`
    SELECT year, month,
      (SELECT COALESCE(SUM(amount),0) FROM lab_bill_entries WHERE year = m.year AND month = m.month) as lab_total,
      (SELECT COALESCE(SUM(amount),0) FROM supplier_invoice_entries WHERE year = m.year AND month = m.month) as supplier_total
    FROM (
      SELECT DISTINCT year, month FROM lab_bill_entries
      UNION
      SELECT DISTINCT year, month FROM supplier_invoice_entries
    ) m
    ORDER BY year, month
  `);

  console.log("\n=== MONTHLY COSTS TREND ===");
  let monthMismatch = 0;
  for (const row of monthly.rows) {
    const year = Number(row.year);
    const month = Number(row.month);
    const neon = reports.monthlyTotals.find((m) => m.year === year && m.month === month);
    const labPence = poundsToPence(row.lab_total);
    const supPence = poundsToPence(row.supplier_total);
    const ok = neon && neon.labTotalPence === labPence && neon.supplierTotalPence === supPence;
    if (!ok) {
      monthMismatch++;
      console.log(
        `  ${year}-${String(month).padStart(2, "0")}: Turso lab£${Number(row.lab_total).toFixed(2)}/sup£${Number(row.supplier_total).toFixed(2)}  Neon lab£${((neon?.labTotalPence ?? 0) / 100).toFixed(2)}/sup£${((neon?.supplierTotalPence ?? 0) / 100).toFixed(2)}`
      );
    }
  }
  if (monthMismatch === 0) console.log("  All monthly buckets MATCH");

  // Extra Neon months not in Turso?
  for (const neon of reports.monthlyTotals) {
    const key = `${neon.year}-${neon.month}`;
    const found = monthly.rows.some(
      (r) => Number(r.year) === neon.year && Number(r.month) === neon.month
    );
    if (!found && (neon.labTotalPence > 0 || neon.supplierTotalPence > 0)) {
      monthMismatch++;
      console.log(`  EXTRA Neon ${key}: lab£${(neon.labTotalPence / 100).toFixed(2)}/sup£${(neon.supplierTotalPence / 100).toFixed(2)}`);
    }
  }

  const pass = summaryOk && monthMismatch === 0;
  console.log(pass ? "\nREPORTING DATA VERIFIED PASS" : "\nREPORTING DATA VERIFY FAIL");
  if (!pass) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
