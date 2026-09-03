/**
 * Find the one Flow conversion mismatch vs Google Sheet.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { google } from "googleapis";
import { prisma } from "@elio/db";
import { isLegacyConverted } from "../apps/flow/lib/flow-service";
import { getFlowSettings } from "@elio/dentally";

const PRACTICE_ID = process.env.PRACTICE_ID?.trim() || "seed-practice";

function loadElioFlowEnv(): Record<string, string> {
  const envPath = resolve(__dirname, "../../ElioFlow/.env.local");
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
  }
  return out;
}

function parseBool(v: string | undefined) {
  return v === "true" || v === "1" || v === "TRUE";
}

function sheetConverted(row: string[]): boolean {
  const status = row[12] || "";
  const hasDeposit = parseBool(row[8]);
  const totalPaid = parseFloat(row[7] || "0") || 0;
  const treatmentBooked = parseBool(row[9]);
  if (status === "converted" || status === "completed") return true;
  return (hasDeposit || totalPaid >= 450) && treatmentBooked;
}

async function main() {
  const env = loadElioFlowEnv();
  const credentials = JSON.parse(env.GOOGLE_CREDENTIALS!);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.SPREADSHEET_ID!,
    range: "Pipeline!A:T",
  });
  const rows = response.data.values || [];
  const settings = await getFlowSettings(PRACTICE_ID);
  const threshold = settings.paidConversionThresholdPence;

  const mismatches: unknown[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0]) continue;
    const dentallyId = String(row[0]).trim();
    const legacyId = `legacy-flow-consult-${PRACTICE_ID}-${dentallyId}`;
    let consult = await prisma.consult.findUnique({ where: { id: legacyId } });
    if (!consult) {
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
    if (!consult) continue;

    const sheetIs = sheetConverted(row);
    const elioIs = isLegacyConverted(consult, threshold);
    if (sheetIs !== elioIs) {
      mismatches.push({
        dentallyId,
        name: row[1],
        sheetStatus: row[12],
        sheetIs,
        elioIs,
        outcome: consult.outcome,
        planSignedUp: consult.planSignedUp,
        hasDeposit: consult.hasDeposit,
        totalPaidPence: consult.totalPaidPence,
        treatmentBooked: consult.treatmentBooked,
        sheetPaid: row[7],
        sheetDeposit: row[8],
        sheetBooked: row[9],
      });
    }
  }

  console.log(`mismatches: ${mismatches.length}`);
  console.log(JSON.stringify(mismatches, null, 2));
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("parity-exports", { recursive: true });
  writeFileSync("parity-exports/conversion-mismatches.json", JSON.stringify(mismatches, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
