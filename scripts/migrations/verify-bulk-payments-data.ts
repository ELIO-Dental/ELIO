/**
 * Verify Bulk Payments unpaid counts + bank entity names vs AuraPay Turso.
 * Read-only.
 */
import { createClient } from "@libsql/client";
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { listUnpaidBillsForBulkPayment } from "../../apps/pay/lib/bulk-payment";
import { parseLegacyPaidFlag } from "../../apps/pay/lib/bill-paid";

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

  const tursoUnpaidLabs = await turso.execute(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM lab_bill_entries WHERE paid = 0 OR paid IS NULL OR paid = '0'"
  );
  const tursoUnpaidSup = await turso.execute(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM supplier_invoice_entries WHERE paid = 0 OR paid IS NULL OR paid = '0'"
  );
  // AuraPay uses paid = 0
  const tursoLabsPaid0 = await turso.execute(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM lab_bill_entries WHERE paid = 0"
  );
  const tursoSupPaid0 = await turso.execute(
    "SELECT COUNT(*) as c, COALESCE(SUM(amount),0) as t FROM supplier_invoice_entries WHERE paid = 0"
  );

  const unpaid = await listUnpaidBillsForBulkPayment(practice.id);
  const labTotal = unpaid.lab_bills.reduce((s, b) => s + b.amountPence, 0);
  const supTotal = unpaid.supplier_invoices.reduce((s, b) => s + b.amountPence, 0);

  console.log("=== BULK UNPAID ===");
  console.log(
    `Turso labs paid=0: ${tursoLabsPaid0.rows[0]?.c} / £${Number(tursoLabsPaid0.rows[0]?.t).toFixed(2)}`
  );
  console.log(
    `Neon unpaid labs:  ${unpaid.lab_bills.length} / £${(labTotal / 100).toFixed(2)}`
  );
  console.log(
    `Turso sup paid=0:  ${tursoSupPaid0.rows[0]?.c} / £${Number(tursoSupPaid0.rows[0]?.t).toFixed(2)}`
  );
  console.log(
    `Neon unpaid sup:   ${unpaid.supplier_invoices.length} / £${(supTotal / 100).toFixed(2)}`
  );

  const labOk =
    Number(tursoLabsPaid0.rows[0]?.c) === unpaid.lab_bills.length &&
    poundsToPence(tursoLabsPaid0.rows[0]?.t) === labTotal;
  const supOk =
    Number(tursoSupPaid0.rows[0]?.c) === unpaid.supplier_invoices.length &&
    poundsToPence(tursoSupPaid0.rows[0]?.t) === supTotal;

  // Bank entities
  const tursoLabs = await turso.execute("SELECT name, account_name, sort_code, account_number FROM saved_labs");
  const tursoSuppliers = await turso.execute(
    "SELECT name, account_name, sort_code, account_number FROM saved_suppliers"
  );
  const neonLabs = await prisma.savedLab.findMany({ where: { practiceId: practice.id } });
  const neonSuppliers = await prisma.savedSupplier.findMany({ where: { practiceId: practice.id } });

  console.log("\n=== BANK ENTITIES ===");
  console.log(`Turso saved labs: ${tursoLabs.rows.length}  Neon: ${neonLabs.length}`);
  console.log(`Turso saved suppliers: ${tursoSuppliers.rows.length}  Neon: ${neonSuppliers.length}`);

  const neonLabNames = new Set(neonLabs.map((l) => l.name.toLowerCase().trim()));
  let labNameMiss = 0;
  for (const row of tursoLabs.rows) {
    if (!neonLabNames.has(String(row.name || "").toLowerCase().trim())) labNameMiss++;
  }
  const neonSupNames = new Set(neonSuppliers.map((s) => s.name.toLowerCase().trim()));
  let supNameMiss = 0;
  for (const row of tursoSuppliers.rows) {
    if (!neonSupNames.has(String(row.name || "").toLowerCase().trim())) supNameMiss++;
  }
  console.log(`Turso lab names missing in Neon: ${labNameMiss}`);
  console.log(`Turso supplier names missing in Neon: ${supNameMiss}`);

  // Spot-check unpaid paid flags from full turso
  const allLabs = await turso.execute("SELECT paid FROM lab_bill_entries");
  const paidTrue = allLabs.rows.filter((r) => parseLegacyPaidFlag(r.paid)).length;
  console.log(`\nTurso lab paid flags true: ${paidTrue}/${allLabs.rows.length}`);

  const pass = labOk && supOk && labNameMiss === 0 && supNameMiss === 0;
  console.log(pass ? "\nBULK PAYMENTS DATA VERIFIED PASS" : "\nBULK PAYMENTS DATA VERIFY FAIL");
  if (!pass) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
