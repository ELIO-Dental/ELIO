/**
 * Reconciliation job orchestration helpers, ported from ElioPlans'
 * `src/app/api/cron/reconcile-payments/route.ts`.
 *
 * The route itself is DB/network-coupled (Prisma queries, GoCardless API calls,
 * NextAuth session checks) and belongs in apps/plans, not here. What's pure and
 * therefore lives in this package is:
 *   - the charge-date window for a billing period (used to query GoCardless), and
 *   - the `reconcile()` comparison itself (see billing.ts).
 *
 * apps/plans' cron route should compose these with its own Prisma/GoCardless
 * calls, mapping PlanPayment/PatientPlanEnrolment rows into the ExpectedCharge /
 * LocalPayment / GoCardlessPayment shapes and calling `reconcile()` — do not
 * reimplement the mismatch-detection logic inline.
 */

/**
 * Given a billing period ("YYYY-MM"), return the inclusive charge-date window
 * `[from, to]` (as "YYYY-MM-DD") spanning the whole calendar month in the
 * practice's local calendar. Mirrors the exact window calculation the real
 * reconcile-payments route used to build its GoCardless `charge_date[gte]` /
 * `charge_date[lte]` query.
 */
export function chargeWindowForPeriod(period: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`Invalid billing period, expected YYYY-MM: ${period}`);
  }
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  const from = `${period}-01`;
  // Day 0 of "next month" is the last day of this month (UTC-safe, no DST issues
  // since we only need the calendar day-of-month, not a wall-clock instant).
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${period}-${String(lastDay).padStart(2, "0")}`;

  return { from, to };
}
