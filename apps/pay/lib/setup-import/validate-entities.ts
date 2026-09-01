import { normalizeBankDetails } from "../saved-entity-bank";

export type ImportMode = "create" | "upsert" | "replace";

export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportRowWarning {
  row: number;
  message: string;
}

export interface EntityImportRow {
  name: string;
  accountName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
}

export function validateEntityImportRow(
  record: Record<string, string>,
  rowNumber: number
): { row?: EntityImportRow; error?: ImportRowError; warning?: ImportRowWarning } {
  const name = record.name?.trim();
  if (!name) {
    return { error: { row: rowNumber, field: "name", message: "name is required" } };
  }

  const bank = normalizeBankDetails({
    account_name: record.account_name,
    sort_code: record.sort_code,
    account_number: record.account_number,
  });

  const warning =
    !bank.sortCode || !bank.accountNumber
      ? { row: rowNumber, message: "No bank details — bulk payment will flag this" }
      : undefined;

  return {
    row: {
      name,
      accountName: bank.accountName ?? name,
      sortCode: bank.sortCode,
      accountNumber: bank.accountNumber,
    },
    warning,
  };
}
