export type PayDiscrepancyType =
  | "invoiced_not_paid"
  | "partial_payment"
  | "log_mismatch"
  | "in_log_not_system"
  | "in_system_not_log";

export interface PayDiscrepancy {
  type: PayDiscrepancyType;
  patientName: string;
  invoicedAmount: number;
  paidAmount: number;
  date: string;
  notes: string;
  resolved?: boolean;
  patientId?: string;
  invoiceId?: string;
  logAmount?: number;
}

export function parsePayDiscrepancies(value: unknown): PayDiscrepancy[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PayDiscrepancy => {
    return Boolean(item && typeof item === "object" && "type" in item && "patientName" in item);
  }) as PayDiscrepancy[];
}

export function discrepancyTypeLabel(type: PayDiscrepancyType): string {
  switch (type) {
    case "invoiced_not_paid":
      return "NOT PAID";
    case "partial_payment":
      return "PARTIAL";
    case "in_log_not_system":
      return "IN LOG ONLY";
    case "in_system_not_log":
      return "IN SYSTEM ONLY";
    case "log_mismatch":
      return "MISMATCH";
    default:
      return "REVIEW";
  }
}

/** Legacy AuraPay badge colours per discrepancy type (Y2.6). */
export function discrepancyTypeBadgeClass(type: PayDiscrepancyType): string {
  switch (type) {
    case "invoiced_not_paid":
      return "bg-(--color-danger)/10 text-(--color-danger)";
    case "partial_payment":
      return "bg-(--color-warning)/10 text-(--color-warning)";
    case "in_log_not_system":
      return "bg-purple-100 text-purple-700";
    case "in_system_not_log":
      return "bg-(--color-brand)/10 text-(--color-brand)";
    case "log_mismatch":
      return "bg-(--color-surface-dim) text-(--color-text-secondary)";
    default:
      return "bg-(--color-surface-dim) text-(--color-text-secondary)";
  }
}

export function discrepancyAmountForBreakdown(d: PayDiscrepancy): number {
  if (d.type === "in_log_not_system" && d.logAmount && d.logAmount > 0) return d.logAmount;
  return d.invoicedAmount > 0 ? d.invoicedAmount : d.paidAmount;
}

export function resolveDiscrepancyAt(discrepancies: PayDiscrepancy[], index: number): PayDiscrepancy[] {
  return discrepancies.map((d, i) => (i === index ? { ...d, resolved: true } : d));
}

export function resolveAllDiscrepancies(discrepancies: PayDiscrepancy[]): PayDiscrepancy[] {
  return discrepancies.map((d) => ({ ...d, resolved: true }));
}

export function unresolvedDiscrepancyCount(discrepancies: PayDiscrepancy[]): number {
  return discrepancies.filter((d) => !d.resolved).length;
}
