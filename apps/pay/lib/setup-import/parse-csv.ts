/** CSV/TSV parsing for setup bulk import. */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

export function parseCsvText(text: string): ParsedCsv {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]!);
  const splitLine = (line: string) => {
    if (delimiter === "\t") return line.split("\t").map((c) => c.trim());
    return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  };

  const headers = splitLine(lines[0]!).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

export function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (header) record[header] = row[index]?.trim() ?? "";
  });
  return record;
}

export function recordsToCsv(headers: string[], rows: Record<string, string>[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n");
}
