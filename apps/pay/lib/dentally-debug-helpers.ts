/** Pure helpers for Dentally debug (testable without API imports). */

export interface DentallyDebugUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export interface DentallyDebugInvoiceUser {
  count: number;
  totalAmount: number;
  name?: string;
}

export function mapDentallyDebugUser(raw: Record<string, unknown>): DentallyDebugUser {
  const first = String(raw.first_name ?? "");
  const last = String(raw.last_name ?? "");
  const name = `${first} ${last}`.trim() || String(raw.name ?? raw.email ?? "Unknown");
  return {
    id: String(raw.id),
    name,
    email: String(raw.email ?? ""),
    role: String(raw.role ?? raw.user_type ?? raw.job_title ?? raw.practitioner_type ?? ""),
    active: raw.active !== false && raw.status !== "inactive",
  };
}

export function buildUnmatchedInvoiceIds(
  invoiceUserIds: Record<string, DentallyDebugInvoiceUser>,
  storedPractitionerIds: Set<string>
): Array<{ id: string; name?: string; count: number; totalAmount: number }> {
  return Object.entries(invoiceUserIds)
    .filter(([uid]) => !storedPractitionerIds.has(uid))
    .map(([id, data]) => ({ id, name: data.name, count: data.count, totalAmount: data.totalAmount }))
    .sort((a, b) => b.count - a.count);
}
