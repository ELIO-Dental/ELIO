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
      className="mb-4 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface-dim) px-4 py-3"
      data-testid="period-payroll-totals-banner"
    >
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
        <div>
          <p className="text-caption text-(--color-text-tertiary)">Dentists</p>
          <p className="font-semibold tabular-nums text-(--color-text-primary)">{t.dentistCount}</p>
        </div>
        <div>
          <p className="text-caption text-(--color-text-tertiary)">Invoiced gross</p>
          <p className="font-semibold tabular-nums text-(--color-text-primary)">
            {formatMoneyGBPOrDash(t.invoicedGrossPence)}
          </p>
        </div>
        <div>
          <p className="text-caption text-(--color-text-tertiary)">NHS</p>
          <p className="font-semibold tabular-nums text-(--color-text-primary)">
            {formatMoneyGBPOrDash(t.nhsIncomePence)}
          </p>
        </div>
        <div>
          <p className="text-caption text-(--color-text-tertiary)">Deductions</p>
          <p className="font-semibold tabular-nums text-(--color-text-primary)">
            {t.deductionsPence ? `-${formatMoneyGBPOrDash(t.deductionsPence)}` : "—"}
          </p>
        </div>
        <div>
          <p className="text-caption text-(--color-text-tertiary)">Total net payroll</p>
          <p className="font-semibold tabular-nums text-(--color-text-primary)">
            {formatMoneyGBPOrDash(t.totalPaymentPence)}
          </p>
        </div>
      </div>
      {t.calculatedCount < t.dentistCount ? (
        <p className="mt-2 text-caption text-(--color-warning)">
          {t.calculatedCount === 0
            ? "Totals pending — complete ops fields and Run calculation."
            : `${t.calculatedCount}/${t.dentistCount} payslips calculated — run calculation for remaining.`}
        </p>
      ) : null}
    </div>
  );
}
