/** Bank detail normalization for saved labs/suppliers (legacy Y3.2). */

export interface SavedEntityBankDetails {
  accountName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
}

export function normalizeSortCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 6) return digits || null;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

export function normalizeAccountNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

export function normalizeBankDetails(input: {
  accountName?: unknown;
  account_name?: unknown;
  sortCode?: unknown;
  sort_code?: unknown;
  accountNumber?: unknown;
  account_number?: unknown;
}): SavedEntityBankDetails {
  const accountNameRaw = input.accountName ?? input.account_name;
  const sortCodeRaw = input.sortCode ?? input.sort_code;
  const accountNumberRaw = input.accountNumber ?? input.account_number;

  return {
    accountName: typeof accountNameRaw === "string" && accountNameRaw.trim() ? accountNameRaw.trim() : null,
    sortCode: normalizeSortCode(sortCodeRaw),
    accountNumber: normalizeAccountNumber(accountNumberRaw),
  };
}

export function hasBankDetails(details: SavedEntityBankDetails): boolean {
  return Boolean(details.accountName && details.sortCode && details.accountNumber);
}
