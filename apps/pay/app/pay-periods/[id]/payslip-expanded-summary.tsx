import { formatMoneyGBPOrDash } from "@elio/ui";
import { computePayslipExpandedMetrics, type PayslipExpandedMetricsInput } from "@/lib/payslip-expanded-metrics";

function MetricCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string;
  variant?: "default" | "danger";
}) {
  const base =
    variant === "danger"
      ? "border-(--color-danger)/30 bg-(--color-danger)/5"
      : "border-(--color-border-subtle) bg-(--color-surface)";
  const valueClass =
    variant === "danger" ? "text-(--color-danger)" : "text-(--color-text-primary)";

  return (
    <div className={`rounded-(--radius-md) border px-3 py-3 shadow-sm ${base}`}>
      <p className="text-caption text-(--color-text-secondary)">{label}</p>
      <p className={`mt-0.5 text-body font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

/** Legacy Y2.4 quick summary + deductions breakdown cards. */
export function PayslipExpandedSummary(props: PayslipExpandedMetricsInput) {
  const metrics = computePayslipExpandedMetrics(props);
  const showDeductions =
    metrics.totalDeductionsPence > 0 ||
    metrics.therapyMinutes > 0 ||
    metrics.superannuationDeductionPence > 0;

  return (
    <div className="space-y-4" data-testid="payslip-expanded-summary">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Gross private" value={formatMoneyGBPOrDash(metrics.grossPrivatePence)} />
        <MetricCard label="Net private" value={formatMoneyGBPOrDash(metrics.netPrivatePence)} />
        <MetricCard label="NHS income" value={formatMoneyGBPOrDash(metrics.nhsIncomePence)} />
        <MetricCard
          label="Total deductions"
          value={`-${formatMoneyGBPOrDash(metrics.totalDeductionsPence)}`}
          variant="danger"
        />
      </div>

      {showDeductions ? (
        <div className="rounded-(--radius-lg) border border-(--color-danger)/30 bg-(--color-danger)/5 p-4">
          <h4 className="text-caption font-semibold uppercase tracking-wide text-(--color-danger)">
            Deductions breakdown
          </h4>
          <div className="mt-2 space-y-1.5 text-caption text-(--color-danger)">
            {metrics.labDeductionPence > 0 ? (
              <div className="flex justify-between gap-4">
                <span>Lab bills</span>
                <span className="font-medium">-{formatMoneyGBPOrDash(metrics.labDeductionPence)}</span>
              </div>
            ) : null}
            {metrics.financeFeesDeductionPence > 0 ? (
              <div className="flex justify-between gap-4">
                <span>Finance fees</span>
                <span className="font-medium">-{formatMoneyGBPOrDash(metrics.financeFeesDeductionPence)}</span>
              </div>
            ) : null}
            {metrics.therapyDeductionPence > 0 ? (
              <div className="flex justify-between gap-4">
                <span>
                  Therapy ({metrics.therapyMinutes} mins)
                </span>
                <span className="font-medium">-{formatMoneyGBPOrDash(metrics.therapyDeductionPence)}</span>
              </div>
            ) : null}
            {metrics.therapyMinutes > 0 && metrics.therapyDeductionPence === 0 ? (
              <div className="flex justify-between gap-4 text-(--color-warning)">
                <span>Therapy ({metrics.therapyMinutes} mins) — rate not set</span>
                <span className="font-medium">£0.00</span>
              </div>
            ) : null}
            {metrics.superannuationDeductionPence > 0 ? (
              <div className="flex justify-between gap-4">
                <span>Superannuation</span>
                <span className="font-medium">-{formatMoneyGBPOrDash(metrics.superannuationDeductionPence)}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-(--color-danger)/20 pt-1.5 font-bold text-(--color-danger)">
              <span>Total deductions</span>
              <span>-{formatMoneyGBPOrDash(metrics.totalDeductionsPence)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
