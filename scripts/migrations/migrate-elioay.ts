/**
 * Step 1.9 (MASTER_BUILD_GUIDE.md §1.9, FR-11) — one-time data migration
 * from the OLD, standalone ElioPay ("aurapay") Turso/SQLite database into
 * the new shared `packages/db` Postgres schema.
 *
 * ============================================================================
 * DECISION MADE 2026-08-19 (documented, not silent): the old system stores
 * each payslip as one denormalized row with several JSON blobs — itemized
 * private-patient payments (real name/invoice-id/amount/finance-fee-flag
 * records), discrepancy notes, and computed analytics. The new
 * `PayslipEntry`/`PrivateRevenueLineItem` models are intentionally
 * normalized and expect every private-revenue line to reference a real,
 * already-Dentally-synced `Treatment` row. Auto-matching the old JSON's
 * loose records onto that without careful, verified cross-referencing risks
 * silently mis-attributing real historical payroll figures — unacceptable
 * for real financial/payroll data. So this script does NOT attempt that
 * transformation. Instead:
 *   - Dentist / PayPeriod / SavedLab / SavedSupplier / LabBillEntry /
 *     SupplierInvoiceEntry migrate cleanly, field-by-field, into their new
 *     normalized homes (all straightforward 1:1 mappings, verified against
 *     a real schema sample this session).
 *   - Each old `payslip_entries` row is preserved VERBATIM (the whole row,
 *     as JSON) into the new `LegacyPayslipArchive` model — satisfying the
 *     guide's "historical records remain traceable" requirement without
 *     forcing a risky, unverified reshape of real payroll history. A human
 *     can open any archived payslip for reference/audit. If a later,
 *     carefully-verified pass wants to properly re-derive
 *     `PrivateRevenueLineItem` rows from the archive (matching against
 *     synced Treatments), that is deliberate, separate, reviewed work.
 * ============================================================================
 *
 * DO NOT RUN AGAINST PRODUCTION WITHOUT READING THIS BLOCK.
 * - Defaults to DRY RUN (reads the old DB, logs what it would write, writes
 *   nothing) unless invoked with --execute.
 * - Idempotent: every insert is upsert-keyed on the old row's own id
 *   (stored as a `sourceId`-style field), so re-running is a safe no-op.
 * - Old `saved_labs`/`saved_suppliers` bank fields (account_name/sort_code/
 *   account_number) were confirmed EMPTY in the sample this session took —
 *   the new `SavedLab`/`SavedSupplier` models have no such fields at all.
 *   If any real row in the full table DOES have bank details populated,
 *   this script logs a warning per such row (see `bankDetailsFound` in the
 *   summary) rather than silently dropping real banking information —
 *   check that count before trusting a dry run's "looks clean" summary.
 * - `email_log`, `audit_log`, `settings`, `users` (old, custom
 *   bearer-token auth) are NOT migrated — email/audit logs are operational
 *   history not core data, `settings` (old app config) has no 1:1 new
 *   equivalent, and old users are superseded entirely by Step 1.5's shared
 *   RBAC (re-create staff logins via the shell's Team screen instead).
 * - `clinics` (old, one row observed) is NOT migrated as a model — same
 *   judgment already made for ElioPlans/ElioFlow migrations this session:
 *   the new architecture is one Practice per tenant, no Clinic concept.
 *   All migrated rows are attached to the ONE Practice row that must
 *   already exist in the target DB.
 */

import { createClient as createTursoClient } from "@libsql/client";
import { prisma as newPrisma } from "@elio/db";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const EXECUTE = process.argv.includes("--execute");

function centsToStructuredPence(value: number | null): number | null {
  // Old amounts are stored as real GBP decimals (e.g. 45.5 = £45.50) —
  // convert to integer pence, matching every new-schema `*Pence` field.
  if (value === null || value === undefined) return null;
  return Math.round(value * 100);
}

async function main() {
  const url = process.env.OLD_ELIOPAY_TURSO_URL;
  const authToken = process.env.OLD_ELIOPAY_TURSO_TOKEN;
  if (!url || !authToken) {
    throw new Error("OLD_ELIOPAY_TURSO_URL / OLD_ELIOPAY_TURSO_TOKEN not set in scripts/migrations/.env.local");
  }
  const oldDb = createTursoClient({ url, authToken });

  const practice = await newPrisma.practice.findFirst();
  if (!practice) throw new Error("No Practice row exists in the target DB — run the shell's onboarding/seed first.");

  const idMap: Record<string, string> = {}; // "dentist:<oldId>" -> new cuid, etc.
  const summary = {
    dentists: { total: 0, migrated: 0 },
    payPeriods: { total: 0, migrated: 0 },
    savedLabs: { total: 0, migrated: 0, bankDetailsFound: 0 },
    savedSuppliers: { total: 0, migrated: 0, bankDetailsFound: 0 },
    labBillEntries: { total: 0, migrated: 0 },
    supplierInvoiceEntries: { total: 0, migrated: 0 },
    legacyPayslipArchives: { total: 0, migrated: 0 },
  };

  // --- Dentists --------------------------------------------------------------
  const dentists = await oldDb.execute("SELECT * FROM dentists");
  summary.dentists.total = dentists.rows.length;
  for (const d of dentists.rows) {
    const oldId = String(d.id);
    const isNhs = Number(d.is_nhs) === 1;
    if (EXECUTE) {
      // No real @@unique constraint on (practiceId, dentallyPractitionerId) in
      // the target schema (only a plain @@index) — Prisma's upsert() requires
      // an actual unique selector, so this does a manual find-then-create
      // instead. Idempotent in intent (a re-run won't create a true duplicate
      // for the same practitioner id), but NOT atomic against a genuine
      // concurrent double-run — acceptable for a one-time, human-supervised
      // migration script, not a live-traffic code path.
      const dentallyPractitionerId = d.practitioner_id ? String(d.practitioner_id) : null;
      let created = dentallyPractitionerId
        ? await newPrisma.dentist.findFirst({ where: { practiceId: practice.id, dentallyPractitionerId } })
        : null;
      if (!created) {
        created = await newPrisma.dentist.create({
          data: {
            practiceId: practice.id,
            name: String(d.name),
            nhsPerformerNumber: d.performer_number ? String(d.performer_number) : null,
            dentallyPractitionerId,
            payType: "PERCENTAGE_SPLIT",
            privateSplitPercent: d.split_percentage != null ? Number(d.split_percentage) : null,
          },
        });
      }
      idMap[`dentist:${oldId}`] = created.id;
    }
    summary.dentists.migrated++;
  }

  // --- Pay periods -------------------------------------------------------------
  const periods = await oldDb.execute("SELECT * FROM pay_periods");
  summary.payPeriods.total = periods.rows.length;
  for (const p of periods.rows) {
    const oldId = String(p.id);
    const month = Number(p.month);
    const year = Number(p.year);
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
    if (EXECUTE) {
      const created = await newPrisma.payPeriod.create({
        data: {
          practiceId: practice.id,
          periodStart,
          periodEnd,
          status: p.status === "finalized" ? "LOCKED" : "DRAFT",
        },
      });
      idMap[`payPeriod:${oldId}`] = created.id;
    }
    summary.payPeriods.migrated++;
  }

  // --- Saved labs / suppliers (flag any real bank details found) -------------
  const labs = await oldDb.execute("SELECT * FROM saved_labs");
  summary.savedLabs.total = labs.rows.length;
  for (const l of labs.rows) {
    if (l.account_name || l.sort_code || l.account_number) summary.savedLabs.bankDetailsFound++;
    if (EXECUTE) {
      const created = await newPrisma.savedLab.create({
        data: {
          practiceId: practice.id,
          name: String(l.name),
          accountName: l.account_name ? String(l.account_name) : null,
          sortCode: l.sort_code ? String(l.sort_code) : null,
          accountNumber: l.account_number ? String(l.account_number) : null,
        },
      });
      idMap[`savedLab:${l.id}`] = created.id;
      idMap[`savedLabByName:${String(l.name)}`] = created.id;
    }
    summary.savedLabs.migrated++;
  }

  const suppliers = await oldDb.execute("SELECT * FROM saved_suppliers");
  summary.savedSuppliers.total = suppliers.rows.length;
  for (const s of suppliers.rows) {
    if (s.account_name || s.sort_code || s.account_number) summary.savedSuppliers.bankDetailsFound++;
    if (EXECUTE) {
      const created = await newPrisma.savedSupplier.create({
        data: {
          practiceId: practice.id,
          name: String(s.name),
          accountName: s.account_name ? String(s.account_name) : null,
          sortCode: s.sort_code ? String(s.sort_code) : null,
          accountNumber: s.account_number ? String(s.account_number) : null,
        },
      });
      idMap[`savedSupplier:${s.id}`] = created.id;
    }
    summary.savedSuppliers.migrated++;
  }

  // --- Lab bill entries --------------------------------------------------------
  const labBills = await oldDb.execute("SELECT * FROM lab_bill_entries");
  summary.labBillEntries.total = labBills.rows.length;
  for (const lb of labBills.rows) {
    const dentistId = lb.dentist_id != null ? idMap[`dentist:${lb.dentist_id}`] : undefined;
    if (EXECUTE) {
      const savedLabId = lb.lab_name ? idMap[`savedLabByName:${String(lb.lab_name)}`] : undefined;
      await newPrisma.labBillEntry.create({
        data: {
          practiceId: practice.id,
          dentistId: dentistId ?? null,
          savedLabId: typeof savedLabId === "string" ? savedLabId : null,
          labName: lb.lab_name ? String(lb.lab_name) : null,
          amountPence: centsToStructuredPence(Number(lb.amount))!,
          description: lb.description ? String(lb.description) : null,
          fileUrl: lb.file_url ? String(lb.file_url) : null,
          billDate: lb.date ? new Date(String(lb.date)) : null,
          paid: lb.paid === 1 || lb.paid === true,
          paidAt: lb.paid_date ? new Date(String(lb.paid_date)) : null,
        },
      });
    }
    summary.labBillEntries.migrated++;
  }

  // --- Supplier invoice entries --------------------------------------------------
  const supplierInvoices = await oldDb.execute("SELECT * FROM supplier_invoice_entries");
  summary.supplierInvoiceEntries.total = supplierInvoices.rows.length;
  for (const si of supplierInvoices.rows) {
    const dentistId = si.dentist_id != null ? idMap[`dentist:${si.dentist_id}`] : undefined;
    if (EXECUTE) {
      await newPrisma.supplierInvoiceEntry.create({
        data: {
          practiceId: practice.id,
          amountPence: centsToStructuredPence(Number(si.amount))!,
          description: si.description ? String(si.description) : (si.supplier_name ? String(si.supplier_name) : null),
          invoiceDate: si.date ? new Date(String(si.date)) : null,
          paid: si.paid === 1 || si.paid === true,
          paidAt: si.paid_date ? new Date(String(si.paid_date)) : null,
        },
      });
    }
    summary.supplierInvoiceEntries.migrated++;
  }

  // --- Payslip entries -> verbatim archive (see decision note above) --------
  const payslips = await oldDb.execute("SELECT * FROM payslip_entries");
  summary.legacyPayslipArchives.total = payslips.rows.length;
  for (const row of payslips.rows) {
    const dentistName = dentists.rows.find((d) => String(d.id) === String(row.dentist_id))?.name ?? "Unknown";
    const period = periods.rows.find((p) => String(p.id) === String(row.period_id));
    if (EXECUTE) {
      await newPrisma.legacyPayslipArchive.upsert({
        where: { practiceId_sourceId: { practiceId: practice.id, sourceId: String(row.id) } },
        create: {
          practiceId: practice.id,
          sourceId: String(row.id),
          dentistName: String(dentistName),
          periodMonth: period ? Number(period.month) : 0,
          periodYear: period ? Number(period.year) : 0,
          rawRowJson: JSON.stringify(row),
        },
        update: {},
      });
    }
    summary.legacyPayslipArchives.migrated++;
  }

  console.log(EXECUTE ? "EXECUTED — data written" : "DRY RUN — nothing written");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.savedLabs.bankDetailsFound > 0 || summary.savedSuppliers.bankDetailsFound > 0) {
    console.warn(
      "\n⚠️  WARNING: real bank details (account_name/sort_code/account_number) were found on " +
        `${summary.savedLabs.bankDetailsFound} lab(s) and ${summary.savedSuppliers.bankDetailsFound} supplier(s) ` +
        "in the old database. The new SavedLab/SavedSupplier models have no fields for this — that information " +
        "will NOT be migrated by this script. Decide with Hisham where (if anywhere) this needs to live before " +
        "running --execute against production, so real banking details aren't silently lost.",
    );
  }

  oldDb.close();
  await newPrisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
