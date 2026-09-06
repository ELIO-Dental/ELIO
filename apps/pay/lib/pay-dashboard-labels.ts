/**
 * Step 37 — AuraPay home dashboard helpers (labels match legacy /dashboard).
 */

/** e.g. May 2026 — same style as old AuraPay recent-period rows. */
export function formatPayPeriodMonthLabel(periodStart: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(periodStart);
}

/** Three-letter month badge (Jan, May, …). */
export function formatPayPeriodMonthShort(periodStart: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: "UTC",
  }).format(periodStart);
}

/** Legacy used Finalized / Draft; ELIO stores LOCKED / DRAFT. */
export function formatPayPeriodStatusLabel(status: string): "Finalized" | "Draft" {
  return status === "LOCKED" ? "Finalized" : "Draft";
}
