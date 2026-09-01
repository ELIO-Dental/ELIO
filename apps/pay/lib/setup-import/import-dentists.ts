import { scopedDb } from "@elio/db";
import type { PayType } from "@elio/db";
import { parseCsvText, rowToRecord } from "./parse-csv";
import type { ImportMode, ImportRowError } from "./validate-entities";

export interface DentistImportRow {
  name: string;
  payType: PayType;
  privateSplitPercent: number | null;
  udaRatePence: number | null;
  hourlyRatePence: number | null;
  nhsPerformerNumber: string | null;
  dentallyPractitionerId: string | null;
}

export interface DentistImportPreview {
  valid: DentistImportRow[];
  errors: ImportRowError[];
}

export interface DentistImportResult extends DentistImportPreview {
  created: number;
  updated: number;
  skipped: number;
}

const DENTIST_HEADERS = [
  "name",
  "pay_type",
  "private_split_percent",
  "uda_rate",
  "hourly_rate",
  "nhs_performer_number",
  "dentally_practitioner_id",
];

export function dentistTemplateCsv(): string {
  return [
    DENTIST_HEADERS.join(","),
    '"Dr Sarah Jones","PERCENTAGE_SPLIT","50","25.00",,"123456","189342"',
    '"Jane Hygienist","HOURLY",,,"35.00",,"189343"',
  ].join("\n");
}

function parsePayType(raw: string): PayType | null {
  const upper = raw.trim().toUpperCase();
  if (upper === "PERCENTAGE_SPLIT" || upper === "SPLIT") return "PERCENTAGE_SPLIT";
  if (upper === "HOURLY") return "HOURLY";
  return null;
}

function poundsToPence(value: string): number | null {
  const n = parseFloat(value.replace(/[£,]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function validateDentistImportRow(
  record: Record<string, string>,
  rowNumber: number
): { row?: DentistImportRow; error?: ImportRowError } {
  const name = record.name?.trim();
  if (!name) return { error: { row: rowNumber, field: "name", message: "name is required" } };

  const payType = parsePayType(record.pay_type ?? "");
  if (!payType) {
    return { error: { row: rowNumber, field: "pay_type", message: "pay_type must be PERCENTAGE_SPLIT or HOURLY" } };
  }

  const privateSplitPercent =
    record.private_split_percent?.trim() !== ""
      ? parseFloat(record.private_split_percent ?? "")
      : null;
  const udaRatePence = record.uda_rate?.trim() ? poundsToPence(record.uda_rate) : null;
  const hourlyRatePence = record.hourly_rate?.trim() ? poundsToPence(record.hourly_rate) : null;

  if (payType === "PERCENTAGE_SPLIT" && privateSplitPercent == null) {
    return { error: { row: rowNumber, field: "private_split_percent", message: "private_split_percent required for split dentists" } };
  }
  if (payType === "HOURLY" && hourlyRatePence == null) {
    return { error: { row: rowNumber, field: "hourly_rate", message: "hourly_rate required for hourly staff" } };
  }

  return {
    row: {
      name,
      payType,
      privateSplitPercent: privateSplitPercent ?? null,
      udaRatePence,
      hourlyRatePence,
      nhsPerformerNumber: record.nhs_performer_number?.trim() || null,
      dentallyPractitionerId: record.dentally_practitioner_id?.trim() || null,
    },
  };
}

export function previewDentistImport(csvText: string): DentistImportPreview {
  const parsed = parseCsvText(csvText);
  const valid: DentistImportRow[] = [];
  const errors: ImportRowError[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const record = rowToRecord(parsed.headers, parsed.rows[i]!);
    const result = validateDentistImportRow(record, i + 2);
    if (result.error) errors.push(result.error);
    else if (result.row) valid.push(result.row);
  }

  return { valid, errors };
}

export async function importDentists(
  practiceId: string,
  rows: DentistImportRow[],
  mode: ImportMode
): Promise<DentistImportResult> {
  if (mode === "replace") {
    throw new Error("Replace mode is not supported for dentists (existing payslips reference them)");
  }

  const db = scopedDb(practiceId);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await db.dentist.findFirst({
      where: {
        practiceId,
        OR: [
          { name: { equals: row.name, mode: "insensitive" } },
          ...(row.dentallyPractitionerId
            ? [{ dentallyPractitionerId: row.dentallyPractitionerId }]
            : []),
        ],
      },
    });

    const data = {
      name: row.name,
      payType: row.payType,
      privateSplitPercent: row.privateSplitPercent,
      udaRatePence: row.udaRatePence,
      hourlyRatePence: row.hourlyRatePence,
      nhsPerformerNumber: row.nhsPerformerNumber,
      dentallyPractitionerId: row.dentallyPractitionerId,
      effectiveFrom: new Date(),
    };

    if (existing) {
      if (mode === "create") {
        skipped++;
        continue;
      }
      await db.dentist.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await db.dentist.create({ data: { practiceId, ...data } });
      created++;
    }
  }

  return { valid: rows, errors: [], created, updated, skipped };
}

export async function exportDentists(practiceId: string): Promise<string> {
  const db = scopedDb(practiceId);
  const dentists = await db.dentist.findMany({ orderBy: { name: "asc" } });
  const lines = [DENTIST_HEADERS.join(",")];
  for (const d of dentists) {
    lines.push(
      [
        `"${d.name.replace(/"/g, '""')}"`,
        `"${d.payType}"`,
        `"${d.privateSplitPercent ?? ""}"`,
        `"${d.udaRatePence != null ? (d.udaRatePence / 100).toFixed(2) : ""}"`,
        `"${d.hourlyRatePence != null ? (d.hourlyRatePence / 100).toFixed(2) : ""}"`,
        `"${d.nhsPerformerNumber ?? ""}"`,
        `"${d.dentallyPractitionerId ?? ""}"`,
      ].join(",")
    );
  }
  return lines.join("\n");
}
