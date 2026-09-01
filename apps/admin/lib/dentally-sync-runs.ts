export interface DentallySyncCounts {
  patients?: number;
  appointments?: number;
  invoices?: number;
  treatments?: number;
  payments?: number;
  accounts?: number;
  paymentPlans?: number;
}

export function parseDentallySyncCounts(counts: unknown): DentallySyncCounts | null {
  if (!counts || typeof counts !== "object") return null;
  const row = counts as Record<string, unknown>;
  const num = (key: keyof DentallySyncCounts) => {
    const value = row[key];
    return typeof value === "number" ? value : undefined;
  };
  return {
    patients: num("patients"),
    appointments: num("appointments"),
    invoices: num("invoices"),
    treatments: num("treatments"),
    payments: num("payments"),
    accounts: num("accounts"),
    paymentPlans: num("paymentPlans"),
  };
}

export function formatDentallySyncCounts(counts: unknown): string {
  const parsed = parseDentallySyncCounts(counts);
  if (!parsed) return "—";
  const parts: string[] = [];
  if (parsed.patients != null) parts.push(`${parsed.patients} patients`);
  if (parsed.appointments != null) parts.push(`${parsed.appointments} appts`);
  if (parsed.invoices != null) parts.push(`${parsed.invoices} invoices`);
  if (parsed.treatments != null) parts.push(`${parsed.treatments} treatments`);
  if (parsed.payments != null && parsed.payments > 0) parts.push(`${parsed.payments} payments`);
  if (parsed.accounts != null && parsed.accounts > 0) parts.push(`${parsed.accounts} accounts`);
  if (parsed.paymentPlans != null && parsed.paymentPlans > 0) parts.push(`${parsed.paymentPlans} plans`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function countDentallyRecordErrors(recordErrors: unknown): number {
  return Array.isArray(recordErrors) ? recordErrors.length : 0;
}

export function formatWhen(iso: Date | string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
