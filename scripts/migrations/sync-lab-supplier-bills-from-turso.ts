/**
 * Sync Lab Bills + Supplier Invoices from AuraPay Turso → Neon for exact data parity.
 *
 * Fixes null billDate/labName/fileUrl/paid after late schema columns, and
 * buckets months using AuraPay year/month (not migration createdAt).
 *
 * Dry-run by default. Pass --execute to write.
 * Pass --labs-only or --suppliers-only to limit scope.
 * Pass --replace to delete existing practice rows then reimport (exact AuraPay mirror).
 */
import { createClient } from "@libsql/client";
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { parseLegacyPaidFlag, parseLegacyPaidDate } from "../../apps/pay/lib/bill-paid";

dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio-deploy-env/pay.env") });
dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio/scripts/migrations/.env.local") });
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL || "";

const EXECUTE = process.argv.includes("--execute");
const REPLACE = process.argv.includes("--replace");
const LABS_ONLY = process.argv.includes("--labs-only");
const SUPPLIERS_ONLY = process.argv.includes("--suppliers-only");
const DO_LABS = !SUPPLIERS_ONLY;
const DO_SUPPLIERS = !LABS_ONLY;

function readTursoFromAuraPayLocal(): { url: string; token: string } | null {
  const p = path.resolve("D:/WEB DEV/Hish/ElioPay/aurapay/.env.local");
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  const url = raw.match(/TURSO_DATABASE_URL="([^"]+)"/)?.[1];
  const token = raw.match(/TURSO_AUTH_TOKEN="([^"]+)"/)?.[1];
  if (!url || !token) return null;
  return { url, token };
}

function poundsToPence(amount: unknown): number {
  return Math.round(Number(amount || 0) * 100);
}

/** Prefer AuraPay month/year for bucketing; day from date string when present. */
function billDateFromAuraPay(row: {
  date?: unknown;
  month?: unknown;
  year?: unknown;
}): Date | null {
  const year = Number(row.year);
  const month = Number(row.month);
  if (Number.isFinite(year) && year > 2000 && Number.isFinite(month) && month >= 1 && month <= 12) {
    let day = 1;
    const dateStr = row.date != null ? String(row.date) : "";
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = Number(m[3]);
      if (d >= 1 && d <= 31) day = d;
    }
    return new Date(Date.UTC(year, month - 1, day));
  }
  if (row.date) {
    const d = new Date(String(row.date));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function createdAtFromAuraPay(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normName(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const fallback = readTursoFromAuraPayLocal();
  const url = process.env.OLD_ELIOPAY_TURSO_URL || fallback?.url;
  const authToken = process.env.OLD_ELIOPAY_TURSO_TOKEN || fallback?.token;
  if (!url || !authToken) throw new Error("Turso credentials missing");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");

  const turso = createClient({ url, authToken });
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No practice in Neon");

  console.log(`Practice: ${practice.name} (${practice.id})`);
  console.log(`Mode: ${EXECUTE ? (REPLACE ? "EXECUTE REPLACE" : "EXECUTE UPSERT-ISH") : "DRY-RUN"}`);

  const dentists = await prisma.dentist.findMany({
    where: { practiceId: practice.id },
    select: { id: true, name: true },
  });
  const dentistByName = new Map(dentists.map((d) => [normName(d.name), d.id]));

  const tursoDentists = await turso.execute("SELECT id, name FROM dentists");
  const dentistIdByOldId = new Map<string, string>();
  for (const d of tursoDentists.rows) {
    const neonId = dentistByName.get(normName(d.name));
    if (neonId) dentistIdByOldId.set(String(d.id), neonId);
  }

  if (DO_LABS) {
    await syncLabBills({ turso, practiceId: practice.id, dentistIdByOldId });
  }
  if (DO_SUPPLIERS) {
    await syncSupplierInvoices({ turso, practiceId: practice.id, dentistIdByOldId });
  }
}

async function syncLabBills(opts: {
  turso: ReturnType<typeof createClient>;
  practiceId: string;
  dentistIdByOldId: Map<string, string>;
}) {
  const { turso, practiceId, dentistIdByOldId } = opts;
  const tursoRows = await turso.execute("SELECT * FROM lab_bill_entries ORDER BY year, month, date, id");
  const neonRows = await prisma.labBillEntry.findMany({ where: { practiceId } });

  console.log("\n=== LAB BILLS ===");
  console.log(`Turso: ${tursoRows.rows.length}  Neon: ${neonRows.length}`);
  console.log(
    `Neon null billDate: ${neonRows.filter((r) => !r.billDate).length}  null labName: ${neonRows.filter((r) => !r.labName).length}  unpaid: ${neonRows.filter((r) => !r.paid).length}`
  );

  const tursoByYm = new Map<string, { count: number; totalPence: number; paid: number }>();
  for (const row of tursoRows.rows) {
    const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
    const cur = tursoByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    cur.count++;
    cur.totalPence += poundsToPence(row.amount);
    if (parseLegacyPaidFlag(row.paid)) cur.paid++;
    tursoByYm.set(key, cur);
  }

  const neonByYm = new Map<string, { count: number; totalPence: number; paid: number }>();
  for (const row of neonRows) {
    const d = row.billDate ?? row.createdAt;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = neonByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    cur.count++;
    cur.totalPence += row.amountPence;
    if (row.paid) cur.paid++;
    neonByYm.set(key, cur);
  }

  const allKeys = [...new Set([...tursoByYm.keys(), ...neonByYm.keys()])].sort();
  console.log("\nYear-Month compare (Turso vs Neon):");
  let mismatch = 0;
  for (const key of allKeys) {
    const t = tursoByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    const n = neonByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    const ok = t.count === n.count && t.totalPence === n.totalPence && t.paid === n.paid;
    if (!ok) {
      mismatch++;
      console.log(
        `  ${key}: Turso ${t.count}/£${(t.totalPence / 100).toFixed(2)}/paid${t.paid}  Neon ${n.count}/£${(n.totalPence / 100).toFixed(2)}/paid${n.paid}`
      );
    }
  }
  if (mismatch === 0) console.log("  All year-month buckets MATCH");
  else console.log(`  ${mismatch} month bucket(s) mismatch`);

  const savedLabs = await prisma.savedLab.findMany({
    where: { practiceId },
    select: { id: true, name: true },
  });
  const savedLabByName = new Map(savedLabs.map((l) => [normName(l.name), l.id]));

  if (!EXECUTE) {
    console.log(`Dry-run: would ${REPLACE ? "replace" : "reimport"} ${tursoRows.rows.length} lab bills`);
    return;
  }

  if (REPLACE) {
    const deleted = await prisma.labBillEntry.deleteMany({ where: { practiceId } });
    console.log(`Deleted ${deleted.count} existing Neon lab bills`);
  } else if (neonRows.length > 0) {
    // Soft replace: clear then reimport for exact AuraPay mirror (same as --replace for labs)
    const deleted = await prisma.labBillEntry.deleteMany({ where: { practiceId } });
    console.log(`Cleared ${deleted.count} Neon lab bills before reimport`);
  }

  let created = 0;
  let dentistMiss = 0;
  for (const lb of tursoRows.rows) {
    const labName = lb.lab_name ? String(lb.lab_name) : null;
    const savedLabId = labName ? savedLabByName.get(normName(labName)) ?? null : null;
    let dentistId: string | null = null;
    if (lb.dentist_id != null) {
      dentistId = dentistIdByOldId.get(String(lb.dentist_id)) ?? null;
      if (!dentistId) dentistMiss++;
    }
    const billDate = billDateFromAuraPay(lb);
    const paid = parseLegacyPaidFlag(lb.paid);
    const paidAt = paid ? parseLegacyPaidDate(lb.paid_date) ?? billDate ?? new Date() : null;
    const createdAt = createdAtFromAuraPay(lb.created_at);

    await prisma.labBillEntry.create({
      data: {
        practiceId,
        dentistId,
        savedLabId,
        labName,
        amountPence: poundsToPence(lb.amount),
        description: lb.description ? String(lb.description) : null,
        fileUrl: lb.file_url ? String(lb.file_url) : null,
        billDate,
        paid,
        paidAt,
        ...(createdAt ? { createdAt } : {}),
      },
    });
    created++;
  }
  console.log(`Created ${created} lab bills (dentist map misses: ${dentistMiss})`);

  // Verify
  const after = await prisma.labBillEntry.findMany({ where: { practiceId } });
  const afterByYm = new Map<string, { count: number; totalPence: number; paid: number }>();
  for (const row of after) {
    const d = row.billDate ?? row.createdAt;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = afterByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    cur.count++;
    cur.totalPence += row.amountPence;
    if (row.paid) cur.paid++;
    afterByYm.set(key, cur);
  }
  let remaining = 0;
  for (const key of [...tursoByYm.keys()].sort()) {
    const t = tursoByYm.get(key)!;
    const n = afterByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    if (t.count !== n.count || t.totalPence !== n.totalPence || t.paid !== n.paid) {
      remaining++;
      console.log(
        `  STILL BAD ${key}: Turso ${t.count}/£${(t.totalPence / 100).toFixed(2)}/paid${t.paid}  Neon ${n.count}/£${(n.totalPence / 100).toFixed(2)}/paid${n.paid}`
      );
    }
  }
  console.log(remaining === 0 ? "LAB BILLS VERIFIED PASS" : `LAB BILLS VERIFY FAIL (${remaining} months)`);
}

async function syncSupplierInvoices(opts: {
  turso: ReturnType<typeof createClient>;
  practiceId: string;
  dentistIdByOldId: Map<string, string>;
}) {
  const { turso, practiceId, dentistIdByOldId } = opts;
  const tursoRows = await turso.execute(
    "SELECT * FROM supplier_invoice_entries ORDER BY year, month, date, id"
  );
  const neonRows = await prisma.supplierInvoiceEntry.findMany({
    where: { practiceId },
    include: { supplier: { select: { name: true } } },
  });

  console.log("\n=== SUPPLIER INVOICES ===");
  console.log(`Turso: ${tursoRows.rows.length}  Neon: ${neonRows.length}`);
  console.log(
    `Neon null invoiceDate: ${neonRows.filter((r) => !r.invoiceDate).length}  null supplierId: ${neonRows.filter((r) => !r.supplierId).length}  unpaid: ${neonRows.filter((r) => !r.paid).length}`
  );

  const tursoByYm = new Map<string, { count: number; totalPence: number; paid: number }>();
  for (const row of tursoRows.rows) {
    const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
    const cur = tursoByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    cur.count++;
    cur.totalPence += poundsToPence(row.amount);
    if (parseLegacyPaidFlag(row.paid)) cur.paid++;
    tursoByYm.set(key, cur);
  }

  const neonByYm = new Map<string, { count: number; totalPence: number; paid: number }>();
  for (const row of neonRows) {
    const d = row.invoiceDate ?? row.createdAt;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = neonByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    cur.count++;
    cur.totalPence += row.amountPence;
    if (row.paid) cur.paid++;
    neonByYm.set(key, cur);
  }

  const allKeys = [...new Set([...tursoByYm.keys(), ...neonByYm.keys()])].sort();
  console.log("\nYear-Month compare (Turso vs Neon):");
  let mismatch = 0;
  for (const key of allKeys) {
    const t = tursoByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    const n = neonByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    const ok = t.count === n.count && t.totalPence === n.totalPence && t.paid === n.paid;
    if (!ok) {
      mismatch++;
      console.log(
        `  ${key}: Turso ${t.count}/£${(t.totalPence / 100).toFixed(2)}/paid${t.paid}  Neon ${n.count}/£${(n.totalPence / 100).toFixed(2)}/paid${n.paid}`
      );
    }
  }
  if (mismatch === 0) console.log("  All year-month buckets MATCH");
  else console.log(`  ${mismatch} month bucket(s) mismatch`);

  if (!EXECUTE) {
    console.log(`Dry-run: would reimport ${tursoRows.rows.length} supplier invoices`);
    return;
  }

  const deleted = await prisma.supplierInvoiceEntry.deleteMany({ where: { practiceId } });
  console.log(`Cleared ${deleted.count} Neon supplier invoices before reimport`);

  let created = 0;
  let dentistMiss = 0;
  for (const si of tursoRows.rows) {
    const supplierName = si.supplier_name ? String(si.supplier_name) : null;
    let supplierId: string | null = null;
    if (supplierName) {
      const existing = await prisma.savedSupplier.findFirst({
        where: { practiceId, name: { equals: supplierName, mode: "insensitive" } },
      });
      if (existing) supplierId = existing.id;
      else {
        const createdSupplier = await prisma.savedSupplier.create({
          data: { practiceId, name: supplierName },
        });
        supplierId = createdSupplier.id;
      }
    }

    let dentistId: string | null = null;
    if (si.dentist_id != null) {
      dentistId = dentistIdByOldId.get(String(si.dentist_id)) ?? null;
      if (!dentistId) dentistMiss++;
    }

    const invoiceDate = billDateFromAuraPay(si);
    const paid = parseLegacyPaidFlag(si.paid);
    const paidAt = paid ? parseLegacyPaidDate(si.paid_date) ?? invoiceDate ?? new Date() : null;
    const createdAt = createdAtFromAuraPay(si.created_at);

    await prisma.supplierInvoiceEntry.create({
      data: {
        practiceId,
        supplierId,
        dentistId,
        amountPence: poundsToPence(si.amount),
        description: si.description ? String(si.description) : null,
        invoiceNumber: si.invoice_number ? String(si.invoice_number) : null,
        fileUrl: si.file_url ? String(si.file_url) : null,
        invoiceDate,
        paid,
        paidAt,
        ...(createdAt ? { createdAt } : {}),
      },
    });
    created++;
  }
  console.log(`Created ${created} supplier invoices (dentist map misses: ${dentistMiss})`);

  const after = await prisma.supplierInvoiceEntry.findMany({ where: { practiceId } });
  const afterByYm = new Map<string, { count: number; totalPence: number; paid: number }>();
  for (const row of after) {
    const d = row.invoiceDate ?? row.createdAt;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = afterByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    cur.count++;
    cur.totalPence += row.amountPence;
    if (row.paid) cur.paid++;
    afterByYm.set(key, cur);
  }
  let remaining = 0;
  for (const key of [...tursoByYm.keys()].sort()) {
    const t = tursoByYm.get(key)!;
    const n = afterByYm.get(key) ?? { count: 0, totalPence: 0, paid: 0 };
    if (t.count !== n.count || t.totalPence !== n.totalPence || t.paid !== n.paid) {
      remaining++;
      console.log(
        `  STILL BAD ${key}: Turso ${t.count}/£${(t.totalPence / 100).toFixed(2)}/paid${t.paid}  Neon ${n.count}/£${(n.totalPence / 100).toFixed(2)}/paid${n.paid}`
      );
    }
  }
  console.log(
    remaining === 0 ? "SUPPLIER INVOICES VERIFIED PASS" : `SUPPLIER INVOICES VERIFY FAIL (${remaining} months)`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
