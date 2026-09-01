import { scopedDb } from "@elio/db";
import { parseCsvText, rowToRecord } from "./parse-csv";
import {
  type EntityImportRow,
  type ImportMode,
  type ImportRowError,
  type ImportRowWarning,
  validateEntityImportRow,
} from "./validate-entities";

export interface EntityImportPreview {
  valid: EntityImportRow[];
  errors: ImportRowError[];
  warnings: ImportRowWarning[];
}

export interface EntityImportResult extends EntityImportPreview {
  created: number;
  updated: number;
  skipped: number;
}

const ENTITY_HEADERS = ["name", "account_name", "sort_code", "account_number"];

export function entityTemplateCsv(): string {
  return [
    ENTITY_HEADERS.join(","),
    '"Acme Dental Lab","Acme Lab Ltd","11-22-33","12345678"',
  ].join("\n");
}

export function previewEntityImport(csvText: string): EntityImportPreview {
  const parsed = parseCsvText(csvText);
  const valid: EntityImportRow[] = [];
  const errors: ImportRowError[] = [];
  const warnings: ImportRowWarning[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const record = rowToRecord(parsed.headers, parsed.rows[i]!);
    const result = validateEntityImportRow(record, i + 2);
    if (result.error) errors.push(result.error);
    else if (result.row) {
      valid.push(result.row);
      if (result.warning) warnings.push(result.warning);
    }
  }

  return { valid, errors, warnings };
}

export async function importEntities(
  practiceId: string,
  type: "lab" | "supplier",
  rows: EntityImportRow[],
  mode: ImportMode
): Promise<EntityImportResult> {
  const db = scopedDb(practiceId);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  if (mode === "replace") {
    if (type === "lab") await db.savedLab.deleteMany({ where: { practiceId } });
    else await db.savedSupplier.deleteMany({ where: { practiceId } });
  }

  for (const row of rows) {
    const data = {
      name: row.name,
      accountName: row.accountName,
      sortCode: row.sortCode,
      accountNumber: row.accountNumber,
    };

    if (type === "lab") {
      const existing = await db.savedLab.findFirst({
        where: { practiceId, name: { equals: row.name, mode: "insensitive" } },
      });
      if (existing) {
        if (mode === "create") {
          skipped++;
          continue;
        }
        await db.savedLab.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await db.savedLab.create({ data: { practiceId, ...data } });
        created++;
      }
    } else {
      const existing = await db.savedSupplier.findFirst({
        where: { practiceId, name: { equals: row.name, mode: "insensitive" } },
      });
      if (existing) {
        if (mode === "create") {
          skipped++;
          continue;
        }
        await db.savedSupplier.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await db.savedSupplier.create({ data: { practiceId, ...data } });
        created++;
      }
    }
  }

  return { valid: rows, errors: [], warnings: [], created, updated, skipped };
}

export async function exportEntities(practiceId: string, type: "lab" | "supplier"): Promise<string> {
  const db = scopedDb(practiceId);
  const entities =
    type === "lab"
      ? await db.savedLab.findMany({ orderBy: { name: "asc" } })
      : await db.savedSupplier.findMany({ orderBy: { name: "asc" } });

  const lines = [ENTITY_HEADERS.join(",")];
  for (const entity of entities) {
    lines.push(
      [
        `"${entity.name.replace(/"/g, '""')}"`,
        `"${(entity.accountName ?? "").replace(/"/g, '""')}"`,
        `"${entity.sortCode ?? ""}"`,
        `"${entity.accountNumber ?? ""}"`,
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function previewEntityImportFromCsv(csvText: string): EntityImportPreview {
  return previewEntityImport(csvText);
}
