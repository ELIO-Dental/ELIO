"use client";

import { formatMoneyGBPOrDash } from "@elio/ui";
import { usePayslipAccordion } from "./payslip-accordion";
import type { PeriodPayslipSummaryRow } from "@/lib/period-payslip-summary";

function DeductionCell({ pence }: { pence: number }) {
  if (!pence) return <span className="text-(--color-text-tertiary)">—</span>;
  return <span className="tabular-nums">-{formatMoneyGBPOrDash(pence)}</span>;
}

/** Step 24 — period ops dashboard: one money row per dentist payslip. */
export function PeriodPayslipSummaryTable({ rows }: { rows: PeriodPayslipSummaryRow[] }) {
  const { expandedId, setExpandedId } = usePayslipAccordion();

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 overflow-x-auto rounded-(--radius-lg) border border-(--color-border-subtle)" data-testid="period-payslip-summary-table">
      <table className="w-full min-w-[960px] border-collapse text-left text-body-sm">
        <thead className="bg-(--color-surface-dim) text-caption uppercase tracking-wide text-(--color-text-tertiary)">
          <tr>
            <th className="px-3 py-2 font-semibold">Dentist</th>
            <th className="px-3 py-2 font-semibold text-right">UDAs</th>
            <th className="px-3 py-2 font-semibold text-right">NHS</th>
            <th className="px-3 py-2 font-semibold text-right" title="All invoice amounts">
              Invoiced
            </th>
            <th className="px-3 py-2 font-semibold text-right" title="Paid-only gross after Run calculation">
              Payable gross
            </th>
            <th className="px-3 py-2 font-semibold text-right">Split</th>
            <th className="px-3 py-2 font-semibold text-right">Net private</th>
            <th className="px-3 py-2 font-semibold text-right">Lab</th>
            <th className="px-3 py-2 font-semibold text-right">Finance</th>
            <th className="px-3 py-2 font-semibold text-right">Therapy</th>
            <th className="px-3 py-2 font-semibold text-right">Adj</th>
            <th className="px-3 py-2 font-semibold text-right">Net Pay</th>
            <th className="px-3 py-2 font-semibold">Prov.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = expandedId === row.id;
            return (
              <tr
                key={row.id}
                data-testid={`period-payslip-summary-row-${row.id}`}
                className={
                  selected
                    ? "cursor-pointer bg-(--color-brand)/5"
                    : "cursor-pointer border-t border-(--color-border-subtle) hover:bg-(--color-surface-dim)"
                }
                onClick={() => setExpandedId(selected ? null : row.id)}
              >
                <td className="px-3 py-2.5 font-medium text-(--color-text-primary)">{row.dentistName}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.udasLabel}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoneyGBPOrDash(row.nhsIncomePence)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoneyGBPOrDash(row.invoicedGrossPence)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatMoneyGBPOrDash(row.payableGrossPence)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{row.splitPercentLabel}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatMoneyGBPOrDash(row.netPrivatePence)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <DeductionCell pence={row.labDeductionPence} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <DeductionCell pence={row.financeDeductionPence} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <DeductionCell pence={row.therapyDeductionPence} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {row.adjustmentsPence ? formatMoneyGBPOrDash(row.adjustmentsPence) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                  {formatMoneyGBPOrDash(row.totalPaymentPence)}
                </td>
                <td className="px-3 py-2.5">
                  {row.provisional ? (
                    <span className="rounded bg-(--color-warning)/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--color-warning)">
                      Yes
                    </span>
                  ) : (
                    <span className="text-(--color-text-tertiary)">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-(--color-border-subtle) px-3 py-2 text-caption text-(--color-text-tertiary)">
        Invoiced = all private invoices. Payable gross / Net Pay use paid-only lines after{" "}
        <strong>Run calculation</strong> (unpaid excluded). “—” means not calculated yet.
      </p>
    </div>
  );
}
