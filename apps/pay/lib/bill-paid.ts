/** Paid-state helpers for lab bills and supplier invoices (legacy Y3.1). */

export interface BillPaidUpdate {
  paid: boolean;
  paidAt: Date | null;
}

export function normalizeBillPaidInput(input: {
  paid?: boolean | number | string | null;
  paid_date?: string | null;
  paidAt?: string | Date | null;
}): BillPaidUpdate {
  const paid =
    input.paid === true ||
    input.paid === 1 ||
    input.paid === "1" ||
    input.paid === "true";

  if (!paid) {
    return { paid: false, paidAt: null };
  }

  if (input.paidAt) {
    const date = input.paidAt instanceof Date ? input.paidAt : new Date(input.paidAt);
    return { paid: true, paidAt: Number.isNaN(date.getTime()) ? new Date() : date };
  }

  if (input.paid_date) {
    const date = new Date(input.paid_date);
    return { paid: true, paidAt: Number.isNaN(date.getTime()) ? new Date() : date };
  }

  return { paid: true, paidAt: new Date() };
}

export function parseLegacyPaidFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function parseLegacyPaidDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
