import { isDateInPeriod } from "@elio/pay-engine";
import type { DentallyInvoiceRaw } from "@elio/dentally";

/** Practice calendar date YYYY-MM-DD in Europe/London (Step 4 — avoid UTC slice bugs). */
export function toPracticeDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Dentally invoice list params (PDF §3.1 / Aura payslip_generator_v4).
 * Half-open [startDate, endExclusive) — client-side filter still required.
 */
export function buildInvoiceListQueryParams(
  siteId: string,
  startDate: string,
  endExclusive: string
): Record<string, string> {
  return {
    site_id: siteId,
    dated_on_after: startDate,
    dated_on_before: endExclusive,
  };
}

/** Step 22 — widen dated_on window so March-dated / May-paid invoices appear in May fetch. */
export function buildInvoiceListQueryParamsForPayPeriod(
  siteId: string,
  periodStart: string,
  periodEndExclusive: string,
  lookbackDays = 180
): Record<string, string> {
  return buildInvoiceListQueryParams(
    siteId,
    shiftYmd(periodStart, -lookbackDays),
    periodEndExclusive
  );
}

/**
 * Dentally `/appointments` list params. Unlike invoices (`dated_on_after`/
 * `dated_on_before`), this endpoint filters on `after`/`before` — see
 * packages/dentally/src/appointment-window.ts ("returns 0 rows unless after/before
 * are set (confirmed live)"). A prior version of this file used `start_date`/
 * `end_date` here, which Dentally silently ignored rather than rejecting — the
 * fetch was pulling the practice's ENTIRE appointment history every time instead of
 * one pay period's worth (found live: 344+ pages and still growing).
 */
export function buildAppointmentsListQueryParamsForPayPeriod(
  siteId: string,
  periodStart: string,
  periodEndExclusive: string
): Record<string, string> {
  return {
    site_id: siteId,
    after: periodStart,
    before: periodEndExclusive,
  };
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
}

function formatYmd({ y, m, d }: { y: number; m: number; d: number }): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const base = parseYmd(ymd);
  const utc = Date.UTC(base.y, base.m - 1, base.d + deltaDays);
  const dt = new Date(utc);
  return formatYmd({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function invoiceDatedOn(inv: Pick<DentallyInvoiceRaw, "dated_on">): string | null {
  const raw = inv.dated_on;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

export function invoicePaidOn(inv: Pick<DentallyInvoiceRaw, "paid_on">): string | null {
  const raw = inv.paid_on;
  if (!raw) return null;
  return String(raw).slice(0, 10);
}

export function isInvoiceInDatedOnPeriod(
  inv: Pick<DentallyInvoiceRaw, "dated_on">,
  startDate: string,
  endExclusive: string
): boolean {
  const dated = invoiceDatedOn(inv);
  if (!dated) return false;
  return isDateInPeriod(dated, startDate, endExclusive);
}

/** Step 22 — paid_on falls in half-open pay month. */
export function isInvoiceInPaidOnPeriod(
  inv: Pick<DentallyInvoiceRaw, "paid_on">,
  startDate: string,
  endExclusive: string
): boolean {
  const paidOn = invoicePaidOn(inv);
  if (!paidOn) return false;
  return isDateInPeriod(paidOn, startDate, endExclusive);
}

/**
 * Step 22 — gross payout eligibility for this period:
 * fully paid AND paid_on ∈ [start, endExclusive).
 */
export function isInvoiceEligibleForGrossInPeriod(
  inv: Pick<DentallyInvoiceRaw, "paid" | "balance" | "amount_outstanding" | "paid_on">,
  startDate: string,
  endExclusive: string
): boolean {
  return isInvoiceFullyPaid(inv) && isInvoiceInPaidOnPeriod(inv, startDate, endExclusive);
}

/**
 * Step 22 — keep invoice in fetch pipeline for this period:
 * - fully paid with paid_on in period (late or same-month settle → gross), OR
 * - dated in period and not fully paid (open → §4.3 flags).
 * Excludes dated-in-period but paid in another month (belongs to paid month only).
 */
export function isInvoiceRelevantForPayPeriod(
  inv: Pick<
    DentallyInvoiceRaw,
    "dated_on" | "paid_on" | "paid" | "balance" | "amount_outstanding"
  >,
  startDate: string,
  endExclusive: string
): boolean {
  if (isInvoiceEligibleForGrossInPeriod(inv, startDate, endExclusive)) return true;
  if (isInvoiceInDatedOnPeriod(inv, startDate, endExclusive) && !isInvoiceFullyPaid(inv)) return true;
  return false;
}

export function parseInvoiceAmount(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

/** Invoice balance in £ (PDF uses `balance`; Dentally may also send amount_outstanding). */
export function invoiceBalance(inv: Pick<DentallyInvoiceRaw, "balance" | "amount_outstanding">): number {
  return parseInvoiceAmount(inv.balance ?? inv.amount_outstanding ?? 0);
}

/**
 * Fully paid only if `paid === true` AND `balance <= 0` (PDF §3.1 / §4.3).
 * `state === "paid"` alone is not enough.
 */
export function isInvoiceFullyPaid(
  inv: Pick<DentallyInvoiceRaw, "paid" | "balance" | "amount_outstanding">
): boolean {
  return inv.paid === true && invoiceBalance(inv) <= 0;
}

export type InvoicePaymentStatus = "paid" | "partial" | "unpaid";

export function resolveInvoicePaymentStatus(
  inv: Pick<DentallyInvoiceRaw, "paid" | "balance" | "amount_outstanding" | "amount">,
  privateAmount: number
): { status: InvoicePaymentStatus; amountPaid: number; amountOutstanding: number } {
  const balance = invoiceBalance(inv);
  if (isInvoiceFullyPaid(inv)) {
    return { status: "paid", amountPaid: privateAmount, amountOutstanding: 0 };
  }

  const total = parseInvoiceAmount(inv.amount);
  const paidPortion = Math.max(0, total - Math.max(0, balance));
  const privatePaid = total > 0 ? (paidPortion / total) * privateAmount : 0;
  const privateOutstanding = Math.max(0, privateAmount - privatePaid);

  if (privatePaid > 0.01 && privateOutstanding > 0.01) {
    return { status: "partial", amountPaid: privatePaid, amountOutstanding: privateOutstanding };
  }

  // Not fully paid per PDF (missing paid flag and/or balance > 0) → unpaid / flag path.
  return { status: "unpaid", amountPaid: 0, amountOutstanding: privateAmount };
}

/** Zero / negative invoice totals never enter gross (PDF §3.1). */
export function shouldDiscardInvoiceAmount(amount: number): boolean {
  return amount <= 0;
}
