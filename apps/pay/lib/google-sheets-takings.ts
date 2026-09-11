/**
 * Google Sheets fetch for dentist private takings logs (AuraPay parity).
 *
 * Tries an authenticated service-account fetch first (works for a sheet shared
 * privately with the service account email — most real practice sheets aren't
 * public), falling back to the public CSV export only if no service account is
 * configured or it can't read that particular sheet. A prior version of this file
 * only had the public-CSV path, silently regressing any practice whose dentist
 * takings sheet wasn't set to "anyone with the link" (it worked in the legacy
 * AuraPay app specifically because that app had this service-account path).
 */

export interface TakingsSheetRow {
  patientName: string;
  date: string;
  amount: number;
  treatment?: string;
}

/** Legacy AuraPay defaults — custom `takings_spreadsheet_ids` settings override these. */
export const DEFAULT_TAKINGS_SPREADSHEET_IDS: Record<string, string> = {
  "Moneeb Ahmad": "1Y-cSU-8rZHr3uHswaZjY2MA0umZT3rxcws6nvwGIMFo",
  "Peter Throw": "1vdKw3_hDWHaenh7OUjrwTdvN-zvf1a8dR45K08HLxr0",
  "Priyanka Kapoor": "13EDcD6zfOdrBwUzQmn9rPXboCTUFeYiuaRHO-gCrjlo",
  "Zeeshan Abbas": "1NWwKzMO7B12WjDnkp-MiKF4j1ge4T6yICSE1anKJhxQ",
  "Ankush Patel": "111HtVp2ShaJm9fxzuaRHNGBWUGRq831joUfawCfevUg",
};

export function resolveTakingsSpreadsheetIds(settingsJson: string): Record<string, string> {
  const trimmed = settingsJson.trim();
  if (!trimmed) return { ...DEFAULT_TAKINGS_SPREADSHEET_IDS };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_TAKINGS_SPREADSHEET_IDS };
    }
    const custom: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim()) custom[key] = value.trim();
    }
    return { ...DEFAULT_TAKINGS_SPREADSHEET_IDS, ...custom };
  } catch {
    return { ...DEFAULT_TAKINGS_SPREADSHEET_IDS };
  }
}

export function getMonthSheetNames(month: number, year: number): string[] {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const m = monthNames[month - 1] ?? "January";
  const ms = monthShort[month - 1] ?? "Jan";
  const y2 = String(year).slice(-2);

  return [
    `${m.toUpperCase()} ${y2}`,
    `${m} ${y2}`,
    `${m.toUpperCase()} ${year}`,
    `${m} ${year}`,
    `${ms.toUpperCase()} ${y2}`,
    `${ms} ${y2}`,
    `${m}`,
    `${ms}`,
    "Sheet1",
    "Takings",
    "Private Takings",
    "Log",
    "Main",
    "Data",
  ];
}

export function parseTakingsDate(dateStr: string): string | null {
  let match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const day = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10);
    let year = parseInt(match[3]!, 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(parseInt(match[2]!, 10)).padStart(2, "0")}-${String(parseInt(match[3]!, 10)).padStart(2, "0")}`;
  }

  match = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (match) {
    const day = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10);
    let year = parseInt(match[3]!, 10);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const monthNames: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const textMatch = dateStr.toLowerCase().match(/^(\d{1,2})\s*([a-z]+)\s*(\d{2,4})$/);
  if (textMatch) {
    const day = parseInt(textMatch[1]!, 10);
    const monthNum = monthNames[textMatch[2]!];
    let year = parseInt(textMatch[3]!, 10);
    if (year < 100) year += 2000;
    if (monthNum) {
      return `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseTakingsCsv(csvText: string, month: number, year: number): TakingsSheetRow[] {
  const lines = csvText.split("\n").filter((line) => line.trim());
  const values = lines.map(parseCsvLine);
  return parseTakingsSheetValues(values, month, year);
}

export function parseTakingsSheetValues(values: string[][], month: number, year: number): TakingsSheetRow[] {
  const rows: TakingsSheetRow[] = [];

  let headerIndex = -1;
  let nameCol = -1;
  let dateCol = -1;
  let amountCol = -1;
  let treatmentCol = -1;

  for (let i = 0; i < Math.min(20, values.length); i++) {
    const row = values[i] || [];
    const lowerRow = row.map((cell) => (cell || "").toString().toLowerCase().trim());

    let foundDate = -1;
    let foundName = -1;
    let foundAmount = -1;
    let foundTreatment = -1;

    for (let j = 0; j < lowerRow.length; j++) {
      const cell = lowerRow[j] ?? "";
      if (cell.includes("patient") || cell === "name" || cell.includes("initials")) {
        foundName = j;
      }
      if (cell === "date" || cell.includes("date")) {
        foundDate = j;
      }
      if (
        cell.includes("fee") ||
        cell.includes("invoiced") ||
        cell.includes("amount") ||
        cell.includes("total") ||
        cell === "£"
      ) {
        foundAmount = j;
      }
      if (
        cell.includes("treatment") ||
        cell.includes("procedure") ||
        cell.includes("description") ||
        cell.includes("completed")
      ) {
        foundTreatment = j;
      }
    }

    if (foundDate >= 0 && (foundName >= 0 || foundAmount >= 0)) {
      headerIndex = i;
      dateCol = foundDate;
      nameCol = foundName >= 0 ? foundName : 1;
      amountCol = foundAmount >= 0 ? foundAmount : 3;
      treatmentCol = foundTreatment >= 0 ? foundTreatment : 2;
      break;
    }
  }

  if (nameCol < 0) nameCol = 0;
  if (dateCol < 0) dateCol = 1;
  if (amountCol < 0) amountCol = 2;
  if (treatmentCol < 0) treatmentCol = 3;

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;

  for (let i = startRow; i < values.length; i++) {
    const row = values[i] || [];
    if (row.length < Math.max(nameCol, dateCol, amountCol) + 1) continue;

    const patientName = (row[nameCol] || "").toString().trim();
    const dateStr = (row[dateCol] || "").toString().trim();
    const amountStr = (row[amountCol] || "").toString().trim();
    const treatment =
      treatmentCol >= 0 && row[treatmentCol] ? row[treatmentCol]!.toString().trim() : undefined;

    if (!patientName || !dateStr) continue;
    if (patientName.toLowerCase().includes("total") || patientName.toLowerCase().includes("gross")) continue;

    const amount = parseFloat(amountStr.replace(/[£,]/g, "")) || 0;
    if (amount <= 0) continue;

    const parsedDate = parseTakingsDate(dateStr);
    if (!parsedDate) continue;

    const [pYear, pMonth] = parsedDate.split("-").map(Number);
    if (pMonth === month && pYear === year) {
      rows.push({ patientName, date: parsedDate, amount, treatment });
    }
  }

  return rows;
}

interface ServiceAccountCredentials {
  client_email: string;
  [key: string]: unknown;
}

/** Parses GOOGLE_SERVICE_ACCOUNT_JSON — raw JSON or base64-encoded JSON, matching AuraPay. */
function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credentialsJson) return null;
  try {
    const jsonStr = credentialsJson.trim().startsWith("{")
      ? credentialsJson
      : Buffer.from(credentialsJson, "base64").toString("utf-8");
    const parsed = JSON.parse(jsonStr) as ServiceAccountCredentials;
    return parsed.client_email ? parsed : null;
  } catch (err) {
    console.error("[google-sheets-takings] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", err);
    return null;
  }
}

export function getServiceAccountEmail(): string {
  return getServiceAccountCredentials()?.client_email ?? "Configure GOOGLE_SERVICE_ACCOUNT_JSON to enable private-sheet access";
}

/** Lazily-loaded — `googleapis` is a heavy dependency only needed on this one path. */
async function getGoogleSheetsClient() {
  const credentials = getServiceAccountCredentials();
  if (!credentials) return null;
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    return google.sheets({ version: "v4", auth });
  } catch (err) {
    console.error("[google-sheets-takings] Failed to initialize Google Sheets client:", err);
    return null;
  }
}

async function fetchViaServiceAccount(
  spreadsheetId: string,
  sheetNames: string[],
  month: number,
  year: number
): Promise<{ rows: TakingsSheetRow[]; error?: string } | null> {
  const sheets = await getGoogleSheetsClient();
  if (!sheets) return null;

  let lastError: string | undefined;
  for (const sheetName of sheetNames) {
    try {
      const response = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
      const values = (response.data.values ?? []) as string[][];
      if (values.length === 0) continue;
      const rows = parseTakingsSheetValues(values, month, year);
      if (rows.length > 0) return { rows };
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 404) continue; // sheet name not found, try the next candidate
      if (code === 403) {
        lastError = `Sheet not shared with the service account. Share it with: ${getServiceAccountEmail()}`;
        continue;
      }
      lastError = err instanceof Error ? err.message : "Google Sheets API error";
    }
  }
  return { rows: [], error: lastError };
}

async function fetchViaPublicCsv(
  spreadsheetId: string,
  sheetNames: string[],
  month: number,
  year: number
): Promise<{ rows: TakingsSheetRow[]; error?: string }> {
  let lastError: string | undefined;

  for (const sheetName of sheetNames) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;

      const text = await res.text();
      if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
        lastError = `Sheet not publicly accessible. Share it as "Anyone with the link can view", or share it with the service account: ${getServiceAccountEmail()}`;
        continue;
      }

      const rows = parseTakingsCsv(text, month, year);
      if (rows.length > 0) return { rows };
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Fetch failed";
    }
  }

  return {
    rows: [],
    error: lastError || `No data found for ${month}/${year}`,
  };
}

export async function fetchGoogleSheetTakings(
  spreadsheetId: string,
  month: number,
  year: number
): Promise<{ rows: TakingsSheetRow[]; error?: string }> {
  const sheetNames = getMonthSheetNames(month, year);

  const viaServiceAccount = await fetchViaServiceAccount(spreadsheetId, sheetNames, month, year);
  if (viaServiceAccount && viaServiceAccount.rows.length > 0) return viaServiceAccount;

  const viaPublic = await fetchViaPublicCsv(spreadsheetId, sheetNames, month, year);
  if (viaPublic.rows.length > 0) return viaPublic;

  return {
    rows: [],
    error: viaPublic.error ?? viaServiceAccount?.error ?? `No data found for ${month}/${year}`,
  };
}
