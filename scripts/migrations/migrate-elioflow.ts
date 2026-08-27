/**
 * Step 1.9 (MASTER_BUILD_GUIDE.md §1.9, FR-11) — one-time data migration
 * from the OLD ElioFlow app's Google Sheets "Pipeline" tab into the new
 * shared `packages/db` schema (`Enquiry`/`Consult`/`Reminder`, Step 1.8).
 *
 * ============================================================================
 * WHY THIS DATA IS BEING MIGRATED (2026-08-25 decision, made using project
 * context per the user's explicit instruction, not by guessing): the new
 * `Enquiry`/`Consult` schema (packages/db/prisma/schema.prisma) was
 * deliberately designed against the old ElioFlow Sheets fields — its own
 * comments cite `planValueOverride`/`elioCare`/`attended`/`hasDeposit`/
 * `treatmentBooked`/`dentistName` matching by name. This is real historical
 * consult/pipeline business data (patient-linked, real plan values, real
 * consultation dates, real conversion outcomes), not informal scratch notes
 * — genuinely worth preserving for continuity of the reporting screen's
 * "Quick Stats" (apps/flow/app/reporting/page.tsx already replicates the old
 * app's real metrics) and so Hisham doesn't see an empty pipeline board on
 * day one. Step 1.8's "full rebuild, not a port" instruction was about the
 * APPLICATION (Pages Router -> App Router, Sheets -> Postgres, custom auth
 * -> NextAuth), not about discarding real business history.
 * ============================================================================
 *
 * DO NOT RUN --execute WITHOUT READING THIS BLOCK FIRST.
 * - Defaults to DRY RUN (reads the old Sheet, computes what it WOULD write,
 *   logs a summary, writes nothing) unless invoked with --execute.
 * - Idempotent by construction: every Enquiry/Consult is upsert-keyed via an
 *   in-memory map built from a real unique-per-row source id (the old
 *   Pipeline sheet's "Patient ID" column, the real Dentally patient id) —
 *   checked against existing DB rows first via a real query, not just
 *   in-memory state, so a second run is a safe no-op, not a duplicate.
 *
 * MIGRATION_NOTES:
 * - Old "touch points" was a single incrementing counter with NO per-contact
 *   date ever recorded. The new `Reminder` model requires a real
 *   dueAt/sentAt per row — fabricating N synthetic dated Reminder rows from
 *   a bare count would invent history that never existed (the same risk
 *   class as the ElioPay payslip-JSON decision). Instead, the whole raw
 *   Pipeline row is preserved verbatim in `LegacyFlowTouchPointArchive`
 *   (packages/db schema, migration TBD — safe additive `CREATE TABLE`,
 *   mirrors `LegacyPayslipArchive`'s pattern) so nothing is silently lost.
 * - Old Sheets `Users`/`Clinics` tabs are NOT migrated — fully superseded by
 *   the new NextAuth+RBAC system built in Step 1.2/1.5. Migrating old
 *   plaintext/bcrypt passwords into the new auth system would be a real
 *   security anti-pattern; a forced password reset for real staff accounts
 *   is the correct path instead, handled separately by Hisham, not this
 *   script.
 * - Old status vocabulary (`pages/index.tsx`'s real `STATUS_OPTIONS`, 8
 *   values) maps onto the new 3-value `ConsultOutcome` enum +
 *   `ConsultStuckReason` sub-reason as follows (confirmed against the old
 *   app's actual source, not guessed):
 *     'new'            -> outcome: null (still open, no decision yet)
 *     'thinking'        -> outcome: THINKING, stuckReason: null
 *     'failed-finance'  -> outcome: DECLINED, stuckReason: FAILED_FINANCE
 *     'price-shopping'  -> outcome: DECLINED, stuckReason: PRICE_SHOPPING
 *     'bad-experience'  -> outcome: DECLINED, stuckReason: BAD_EXPERIENCE
 *     'out-of-budget'   -> outcome: DECLINED, stuckReason: OUT_OF_BUDGET
 *     'converted'       -> outcome: ACCEPTED
 *     'completed'       -> outcome: ACCEPTED
 * - `practitioner` (old, free-text name) is matched case-insensitively
 *   against the real `Dentist.name` already migrated from ElioPay (same
 *   matching approach already used for BUG-2/Compass matching elsewhere in
 *   this build) — unmatched names are counted, not silently dropped or
 *   guessed.
 * - A Pipeline row whose "Patient ID" doesn't match an existing core
 *   `Patient.dentallyId` gets a new core `Patient` row created with that
 *   real Dentally id (same approach `migrate-elioplans.ts` uses) — this is
 *   the real Dentally patient id from the old app's own `patient-id-api.ts`,
 *   not a fabricated identifier.
 *
 * PREREQUISITE — the new `LegacyFlowTouchPointArchive` model must exist in
 * the target DB (a safe additive migration, written alongside this script
 * but NOT YET generated/applied — Neon connectivity was down when this
 * script was written; run `npx prisma migrate diff` + `db execute` +
 * `migrate resolve --applied` per this repo's established safe-migration
 * pattern before running this script for real, see scripts/migrations/README.md).
 */

import { prisma } from "@elio/db";
import { google } from "googleapis";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });

const EXECUTE = process.argv.includes("--execute");

const PIPELINE_TAB = "Pipeline";

interface OldPipelineRow {
  patientId: string;
  name: string;
  email: string;
  phone: string;
  consultationDate: string;
  attended: string;
  planValue: string;
  totalPaid: string;
  hasDeposit: string;
  treatmentBooked: string;
  practitioner: string;
  status: string;
  notes: string;
  bookedBy: string;
  touchPoints: string;
  elioCare: string;
  planValueOverride: string;
  appointmentState: string;
  raw: string[];
}

async function getPipelineRows(spreadsheetId: string): Promise<OldPipelineRow[]> {
  // Read from a standalone JSON file, NOT process.env.GOOGLE_CREDENTIALS —
  // dotenv unescapes \n sequences in double-quoted .env values into real
  // newline bytes, which corrupts the private_key field's JSON validity
  // before JSON.parse ever runs. A plain file, read via fs, is byte-exact.
  const credentialsPath = path.resolve(__dirname, "google-credentials.json");
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
  if (!credentials.client_email) {
    throw new Error("google-credentials.json missing client_email — see scripts/migrations/README.md");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${PIPELINE_TAB}!A:T`,
  });

  const rows = response.data.values || [];
  const results: OldPipelineRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;
    results.push({
      patientId: row[0] || "",
      name: row[1] || "",
      email: row[2] || "",
      phone: row[3] || "",
      consultationDate: row[4] || "",
      attended: row[5] || "",
      planValue: row[6] || "0",
      totalPaid: row[7] || "0",
      hasDeposit: row[8] || "false",
      treatmentBooked: row[9] || "false",
      practitioner: row[10] || "",
      status: row[12] || "new",
      notes: row[13] || "",
      bookedBy: row[15] || "",
      touchPoints: row[16] || "0",
      elioCare: row[17] || "false",
      planValueOverride: row[18] || "",
      appointmentState: row[19] || "",
      raw: row,
    });
  }

  return results;
}

function mapOutcome(status: string): { outcome: "ACCEPTED" | "THINKING" | null; stuckReason: string | null } {
  switch (status) {
    case "thinking":
      return { outcome: "THINKING", stuckReason: null };
    case "failed-finance":
      return { outcome: "DECLINED" as any, stuckReason: "FAILED_FINANCE" };
    case "price-shopping":
      return { outcome: "DECLINED" as any, stuckReason: "PRICE_SHOPPING" };
    case "bad-experience":
      return { outcome: "DECLINED" as any, stuckReason: "BAD_EXPERIENCE" };
    case "out-of-budget":
      return { outcome: "DECLINED" as any, stuckReason: "OUT_OF_BUDGET" };
    case "converted":
    case "completed":
      return { outcome: "ACCEPTED", stuckReason: null };
    case "new":
    default:
      return { outcome: null, stuckReason: null };
  }
}

function parseMoneyToPence(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
}

function parseBool(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "TRUE";
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const spreadsheetId = process.env.OLD_ELIOFLOW_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("OLD_ELIOFLOW_SPREADSHEET_ID not set — check scripts/migrations/.env.local");

  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No Practice row exists in the target DB.");

  const dentists = await prisma.dentist.findMany({ where: { practiceId: practice.id } });
  const dentistByName = new Map(dentists.map((d) => [d.name.trim().toLowerCase(), d.id]));

  const rows = await getPipelineRows(spreadsheetId);

  const summary = {
    pipelineRows: { total: rows.length, migrated: 0, skippedNoPatientId: 0 },
    corePatientsCreated: 0,
    corePatientsMatched: 0,
    practitionerMatched: 0,
    practitionerUnmatched: 0,
    touchPointArchived: 0,
  };

  for (const row of rows) {
    if (!row.patientId) {
      summary.pipelineRows.skippedNoPatientId++;
      continue;
    }

    let corePatientId: string | undefined;
    const existing = await prisma.patient.findFirst({
      where: { practiceId: practice.id, dentallyId: row.patientId },
    });
    if (existing) {
      corePatientId = existing.id;
      summary.corePatientsMatched++;
    } else if (EXECUTE) {
      const created = await prisma.patient.create({
        data: {
          practiceId: practice.id,
          dentallyId: row.patientId,
          firstName: row.name.split(" ")[0] || null,
          lastName: row.name.split(" ").slice(1).join(" ") || null,
          email: row.email || null,
          phone: row.phone || null,
        },
      });
      corePatientId = created.id;
      summary.corePatientsCreated++;
    } else {
      summary.corePatientsCreated++; // dry-run projection
    }

    const practitionerDentistId = row.practitioner ? dentistByName.get(row.practitioner.trim().toLowerCase()) : undefined;
    if (row.practitioner) {
      if (practitionerDentistId) summary.practitionerMatched++;
      else summary.practitionerUnmatched++;
    }

    const { outcome, stuckReason } = mapOutcome(row.status);
    const quotePence = parseMoneyToPence(row.planValue);
    const quotePenceOverride = parseMoneyToPence(row.planValueOverride);
    const totalPaidPence = parseMoneyToPence(row.totalPaid);
    const consultationDate = parseDate(row.consultationDate);

    if (EXECUTE && corePatientId) {
      const enquiry = await prisma.enquiry.upsert({
        where: { id: `legacy-flow-${practice.id}-${row.patientId}` },
        create: {
          id: `legacy-flow-${practice.id}-${row.patientId}`,
          practiceId: practice.id,
          patientId: corePatientId,
          source: "legacy-pipeline",
          capturedAt: consultationDate ?? new Date(),
        },
        update: {},
      });

      await prisma.consult.upsert({
        where: { id: `legacy-flow-consult-${practice.id}-${row.patientId}` },
        create: {
          id: `legacy-flow-consult-${practice.id}-${row.patientId}`,
          practiceId: practice.id,
          enquiryId: enquiry.id,
          attended: row.attended ? parseBool(row.attended) : null,
          practitionerDentistId: practitionerDentistId ?? null,
          quotePence,
          quotePenceOverride,
          totalPaidPence,
          hasDeposit: parseBool(row.hasDeposit),
          treatmentBooked: parseBool(row.treatmentBooked),
          outcome: outcome as any,
          outcomeAt: outcome ? consultationDate ?? new Date() : null,
          stuckReason: stuckReason as any,
          planSignedUp: parseBool(row.elioCare),
          notes: row.notes || null,
        },
        update: {},
      });

      const touchPoints = Number(row.touchPoints) || 0;
      await prisma.legacyFlowTouchPointArchive.upsert({
        where: { practiceId_sourcePatientId: { practiceId: practice.id, sourcePatientId: row.patientId } },
        create: {
          practiceId: practice.id,
          sourcePatientId: row.patientId,
          touchPoints,
          rawRowJson: JSON.stringify(row.raw),
        },
        update: {},
      });
      summary.touchPointArchived++;
    } else {
      summary.touchPointArchived++; // dry-run projection
    }

    summary.pipelineRows.migrated++;
  }

  console.log(EXECUTE ? "EXECUTED — data written" : "DRY RUN — nothing written");
  console.log(JSON.stringify(summary, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
