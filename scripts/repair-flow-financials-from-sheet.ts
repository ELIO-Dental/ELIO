/**
 * Repair wiped Flow financial fields from the live ElioFlow Google Sheet.
 * Idempotent UPDATE only — does not create patients/consults/seed.
 *
 * Usage:
 *   PRACTICE_ID=seed-practice npx tsx scripts/repair-flow-financials-from-sheet.ts
 *   PRACTICE_ID=seed-practice npx tsx scripts/repair-flow-financials-from-sheet.ts --execute
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { google } from "googleapis";
import { prisma } from "@elio/db";

const EXECUTE = process.argv.includes("--execute");
const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";

function loadElioFlowEnv(): Record<string, string> {
  const envPath = resolve(__dirname, "../../ElioFlow/.env.local");
  if (!existsSync(envPath)) throw new Error(`Missing ${envPath}`);
  const raw = readFileSync(envPath, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("GOOGLE_CREDENTIALS=")) {
      const rest = line.slice("GOOGLE_CREDENTIALS=".length).trim();
      const start = rest.indexOf("{");
      const end = rest.lastIndexOf("}");
      if (start >= 0 && end > start) out.GOOGLE_CREDENTIALS = rest.slice(start, end + 1);
      continue;
    }
    const m = line.match(/^([A-Z0-9_]+)="([^"]*)"$/);
    if (m) out[m[1]] = m[2];
    else {
      const m2 = line.match(/^([A-Z0-9_]+)=(.+)$/);
      if (m2) out[m2[1]] = m2[2].replace(/^"|"$/g, "");
    }
  }
  return out;
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

function mapOutcome(status: string): {
  outcome: "ACCEPTED" | "THINKING" | "DECLINED" | null;
  stuckReason: string | null;
} {
  switch (status) {
    case "thinking":
      return { outcome: "THINKING", stuckReason: null };
    case "failed-finance":
      return { outcome: "DECLINED", stuckReason: "FAILED_FINANCE" };
    case "price-shopping":
      return { outcome: "DECLINED", stuckReason: "PRICE_SHOPPING" };
    case "bad-experience":
      return { outcome: "DECLINED", stuckReason: "BAD_EXPERIENCE" };
    case "out-of-budget":
      return { outcome: "DECLINED", stuckReason: "OUT_OF_BUDGET" };
    case "converted":
    case "completed":
      return { outcome: "ACCEPTED", stuckReason: null };
    default:
      return { outcome: null, stuckReason: null };
  }
}

async function main() {
  const env = loadElioFlowEnv();
  const spreadsheetId = env.SPREADSHEET_ID;
  if (!spreadsheetId || !env.GOOGLE_CREDENTIALS) throw new Error("ElioFlow Sheet credentials missing");

  const credentials = JSON.parse(env.GOOGLE_CREDENTIALS);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Pipeline!A:T",
  });
  const rows = response.data.values || [];

  console.log(`\nRepair Flow financials — practice=${PRACTICE_ID} execute=${EXECUTE}`);
  console.log(`Sheet rows (excl header): ${Math.max(0, rows.length - 1)}\n`);

  let matched = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0]) continue;
    const dentallyId = String(row[0]).trim();
    const legacyConsultId = `legacy-flow-consult-${PRACTICE_ID}-${dentallyId}`;

    const { outcome, stuckReason } = mapOutcome(row[12] || "");
    const data = {
      quotePence: parseMoneyToPence(row[6]),
      quotePenceOverride: parseMoneyToPence(row[18]),
      totalPaidPence: parseMoneyToPence(row[7]) ?? 0,
      hasDeposit: parseBool(row[8]),
      treatmentBooked: parseBool(row[9]),
      attended: row[5] ? parseBool(row[5]) : null,
      outcome: outcome as "ACCEPTED" | "THINKING" | "DECLINED" | null,
      stuckReason: stuckReason as
        | "FAILED_FINANCE"
        | "PRICE_SHOPPING"
        | "BAD_EXPERIENCE"
        | "OUT_OF_BUDGET"
        | null,
      planSignedUp: parseBool(row[17]),
      notes: row[13] || null,
      bookedBy: row[15] || null,
    };

    let consult = await prisma.consult.findUnique({ where: { id: legacyConsultId } });
    if (!consult) {
      // Fallback: match via patient dentallyId → enquiry → consult
      const patient = await prisma.patient.findFirst({
        where: { practiceId: PRACTICE_ID, dentallyId },
        select: { id: true },
      });
      if (patient) {
        consult = await prisma.consult.findFirst({
          where: { practiceId: PRACTICE_ID, enquiry: { patientId: patient.id } },
          orderBy: { createdAt: "desc" },
        });
      }
    }

    if (!consult) {
      missing++;
      continue;
    }
    matched++;

    const changed =
      (consult.totalPaidPence ?? 0) !== data.totalPaidPence ||
      Boolean(consult.hasDeposit) !== data.hasDeposit ||
      Boolean(consult.treatmentBooked) !== data.treatmentBooked ||
      (consult.quotePence ?? null) !== data.quotePence ||
      (consult.quotePenceOverride ?? null) !== data.quotePenceOverride ||
      consult.outcome !== data.outcome ||
      Boolean(consult.planSignedUp) !== data.planSignedUp ||
      consult.attended !== data.attended;

    if (!changed) {
      skipped++;
      continue;
    }

    if (EXECUTE) {
      await prisma.consult.update({
        where: { id: consult.id },
        data: {
          quotePence: data.quotePence,
          quotePenceOverride: data.quotePenceOverride,
          totalPaidPence: data.totalPaidPence,
          hasDeposit: data.hasDeposit,
          treatmentBooked: data.treatmentBooked,
          attended: data.attended,
          outcome: data.outcome,
          stuckReason: data.stuckReason,
          planSignedUp: data.planSignedUp,
          notes: data.notes,
          bookedBy: data.bookedBy,
        },
      });
    }
    updated++;
  }

  const summary = { matched, updated, skippedUnchanged: skipped, missingInElio: missing, execute: EXECUTE };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync(join(process.cwd(), "parity-exports"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "parity-exports", "flow-financial-repair-summary.json"),
    JSON.stringify({ ...summary, at: new Date().toISOString() }, null, 2)
  );

  if (!EXECUTE) {
    console.log("\nDRY RUN — re-run with --execute to write updates (no creates / no seed).\n");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
