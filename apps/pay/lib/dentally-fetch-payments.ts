import type { DentallyPaymentRaw } from "@elio/dentally";

/** PDF §3.2 / Aura: payments from 180 days before period start → 30 days after exclusive end. */
export function paymentWindowBounds(
  periodStartDate: string,
  periodEndExclusive: string
): { datedAfter: string; datedBefore: string } {
  const start = parseYmd(periodStartDate);
  const end = parseYmd(periodEndExclusive);
  const datedAfter = addDays(start, -180);
  const datedBefore = addDays(end, 30);
  return {
    datedAfter: formatYmd(datedAfter),
    datedBefore: formatYmd(datedBefore),
  };
}

export function buildPaymentsListQueryParams(
  siteId: string,
  datedAfter: string,
  datedBefore: string
): Record<string, string> {
  return {
    site_id: siteId,
    dated_after: datedAfter,
    dated_before: datedBefore,
  };
}

/** Exact Dentally method label for Tabeo / finance fee path (PDF §3.2). */
export function isFinancePaymentMethod(method: string | null | undefined): boolean {
  return String(method ?? "").trim().toLowerCase() === "finance";
}

/**
 * Map invoice_id → payment method from `explanations[].invoice_id`.
 * Precedence: any Finance wins (multiple payments per invoice).
 */
export function buildInvoicePaymentMethodMap(
  payments: DentallyPaymentRaw[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const payment of payments) {
    const method = payment.method ?? "Unknown";
    for (const explanation of payment.explanations ?? []) {
      if (explanation.invoice_id == null) continue;
      const invoiceId = String(explanation.invoice_id);
      const prev = map.get(invoiceId);
      if (prev && isFinancePaymentMethod(prev)) continue;
      if (isFinancePaymentMethod(method)) {
        map.set(invoiceId, method);
      } else if (!prev) {
        map.set(invoiceId, method);
      }
    }
  }
  return map;
}

/** Backup: patient has any Finance payment in the window. */
export function buildPatientFinanceSet(payments: DentallyPaymentRaw[]): Set<string> {
  const set = new Set<string>();
  for (const payment of payments) {
    if (!isFinancePaymentMethod(payment.method)) continue;
    if (payment.patient_id == null) continue;
    set.add(String(payment.patient_id));
  }
  return set;
}

export function invoiceIsFinanceFromPayments(
  invoiceId: string,
  patientId: string,
  methodByInvoice: Map<string, string>,
  financePatients: Set<string>
): boolean {
  const method = methodByInvoice.get(invoiceId);
  // Known non-finance method on the invoice wins — do not override with patient history.
  if (method != null && method.trim() !== "") {
    return isFinancePaymentMethod(method);
  }
  if (patientId && financePatients.has(patientId)) return true;
  return false;
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

function formatYmd({ y, m, d }: { y: number; m: number; d: number }): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Calendar-day arithmetic (no Date / UTC) for YYYY-MM-DD windows. */
function addDays(base: { y: number; m: number; d: number }, delta: number): { y: number; m: number; d: number } {
  const utc = Date.UTC(base.y, base.m - 1, base.d + delta);
  const dt = new Date(utc);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
