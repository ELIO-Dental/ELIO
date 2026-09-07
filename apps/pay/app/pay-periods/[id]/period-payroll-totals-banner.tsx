"use client";

import { formatMoneyGBPOrDash } from "@elio/ui";
import type { PeriodPayslipSummaryRow } from "@/lib/period-payslip-summary";
import { sumPeriodPayrollTotals } from "@/lib/period-payslip-summary";

/** AuraPay-style period payroll totals banner (null-safe until Run calculation). */
export function PeriodPayrollTotalsBanner({ rows }: { rows: PeriodPayslipSummaryRow[] }) {
  if (rows.length === 0) return null;
  const t = sumPeriodPayrollTotals(rows);

  return (
    <div
      className="rounded-(--radius-xl) bg-linear-to-r from-(--color-text-primary) to-(--color-primary-900) px-5 py-5 text-white shadow-(--shadow-sm)"
      data-testid="period-payroll-totals-banner"
    >
      <p className="text-body-sm font-medium text-white/60">Total Net Payroll</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-(--color-warning)">
        {formatMoneyGBPOrDash(t.totalPaymentPence)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 sm:grid-cols-4">
        <div>
          <p className="text-caption text-white/55">Total Gross</p>
          <p className="text-body-sm font-semibold tabular-nums">
            {formatMoneyGBPOrDash(t.invoicedGrossPence)}
          </p>
        </div>
        <div>
          <p className="text-caption text-white/55">Total NHS</p>
          <p className="text-body-sm font-semibold tabular-nums">
            {formatMoneyGBPOrDash(t.nhsIncomePence)}
          </p>
        </div>
        <div>
          <p className="text-caption text-white/55">Total Deductions</p>
          <p className="text-body-sm font-semibold tabular-nums text-red-300">
            {t.deductionsPence ? `-${formatMoneyGBPOrDash(t.deductionsPence)}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-caption text-white/55">Dentists</p>
          <p className="text-body-sm font-semibold tabular-nums">{t.dentistCount}</p>
        </div>
      </div>
      {t.calculatedCount < t.dentistCount ? (
        <p className="mt-3 text-caption text-(--color-warning)">
          {t.calculatedCount === 0
            ? "Totals pending — complete ops fields and Run calculation."
            : `${t.calculatedCount}/${t.dentistCount} payslips calculated — run calculation for remaining.`}
        </p>
      ) : null}
    </div>
  );
}
