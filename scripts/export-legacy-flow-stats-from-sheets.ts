import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { google } from "googleapis";

const envPath = resolve(__dirname, "../../ElioFlow/.env.local");
const raw = readFileSync(envPath, "utf8");

function getEnv(name: string): string | null {
  if (name === "GOOGLE_CREDENTIALS") {
    const line = raw.split(/\r?\n/).find((l) => l.startsWith("GOOGLE_CREDENTIALS="));
    if (!line) return null;
    const rest = line.slice("GOOGLE_CREDENTIALS=".length).trim();
    const start = rest.indexOf("{");
    const end = rest.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    return rest.slice(start, end + 1);
  }
  const re = new RegExp(`^${name}="([^"]*)"`, "m");
  const m = raw.match(re);
  if (m) return m[1];
  const re2 = new RegExp(`^${name}=([^\\r\\n]+)`, "m");
  const m2 = raw.match(re2);
  return m2 ? m2[1].trim().replace(/^"|"$/g, "") : null;
}

async function main() {
  const spreadsheetId = getEnv("SPREADSHEET_ID");
  const credsStr = getEnv("GOOGLE_CREDENTIALS");
  console.log("ssid", spreadsheetId);
  console.log("creds len", credsStr?.length ?? 0);
  if (!spreadsheetId || !credsStr) throw new Error("missing env");

  const credentials = JSON.parse(credsStr);
  console.log("email", credentials.client_email);

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
  console.log("rows including header", rows.length);

  const patients = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.[0]) continue;
    const attended = (row[5] || "") === "true";
    const rawPlanValue = parseFloat(row[6] || "0") || 0;
    const planValueOverride = row[18] ? parseFloat(row[18]) : null;
    const treatmentPlanValue =
      planValueOverride !== null && !Number.isNaN(planValueOverride) ? planValueOverride : rawPlanValue;
    const totalPaid = parseFloat(row[7] || "0") || 0;
    const hasDeposit = (row[8] || "") === "true";
    const hasTreatmentBooked = (row[9] || "") === "true";
    const status = row[12] || "";
    const elioCare = (row[17] || "") === "true";
    const isConverted =
      status === "converted" ||
      status === "completed" ||
      ((hasDeposit || totalPaid >= 450) && hasTreatmentBooked);
    patients.push({ attended, treatmentPlanValue, totalPaid, isConverted, elioCare });
  }

  const attendedCount = patients.filter((p) => p.attended).length;
  const stats = {
    totalConsultations: patients.length,
    attended: attendedCount,
    converted: patients.filter((p) => p.isConverted).length,
    stuck: patients.filter((p) => !p.isConverted && p.attended).length,
    totalPipelineValue: Math.round(
      patients.filter((p) => !p.isConverted).reduce((s, p) => s + p.treatmentPlanValue, 0)
    ),
    totalPlanned: Math.round(patients.reduce((s, p) => s + p.treatmentPlanValue, 0)),
    totalPaid: Math.round(patients.reduce((s, p) => s + p.totalPaid, 0)),
    elioCareCount: patients.filter((p) => p.elioCare).length,
    conversionRate:
      attendedCount > 0
        ? Math.round((patients.filter((p) => p.isConverted).length / attendedCount) * 100)
        : 0,
  };

  const outDir = join(process.cwd(), "parity-exports");
  mkdirSync(outDir, { recursive: true });
  const payload = { source: "elioflow-google-sheets", spreadsheetId, exportedAt: new Date().toISOString(), stats };
  writeFileSync(join(outDir, "legacy-flow-stats.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(stats, null, 2));
  console.log("wrote parity-exports/legacy-flow-stats.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
