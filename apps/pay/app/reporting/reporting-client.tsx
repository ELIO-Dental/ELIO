"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import {
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableCellMoney,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
  formatMoneyGBP,
} from "@elio/ui";
import { AlertTriangle, BarChart3, CheckCircle2, TrendingUp } from "lucide-react";
import type { ReportingPeriodPoint } from "@/lib/pay-service";
import type { BillsReportingPayload } from "@/lib/bills-reporting";
import { monthShortLabel } from "@/lib/bills-reporting";

const DENTIST_COLORS = [
  "var(--color-primary-500)",
  "var(--color-accent-teal)",
  "var(--color-accent-amber)",
  "var(--color-danger)",
  "#8b5cf6",
  "#ec4899",
  "#6366f1",
];

function periodLabel(p: ReportingPeriodPoint) {
  return new Date(p.periodStart).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

interface ThemedTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: NameType; name?: NameType; value?: ValueType; color?: string }>;
  label?: string;
}

function ThemedTooltip({ active, payload, label }: ThemedTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-2 shadow-(--shadow-lg)">
      <p className="text-caption font-semibold text-(--color-text-primary)">{label}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2 text-caption text-(--color-text-secondary)">
            <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.name}:</span>
            <span className="font-medium text-(--color-text-primary)">{formatMoneyGBP(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, detail, danger = false }: { label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-caption font-medium uppercase tracking-wide text-(--color-text-secondary)">{label}</p>
        <p className={`mt-1 text-h3 font-bold tabular-nums ${danger ? "text-(--color-danger)" : "text-(--color-text-primary)"}`}>
          {value}
        </p>
        <p className="mt-1 text-caption text-(--color-text-tertiary)">{detail}</p>
      </CardContent>
    </Card>
  );
}

export interface ReportingClientProps {
  initialPeriods: ReportingPeriodPoint[];
  bills: BillsReportingPayload;
}

/** Legacy reporting parity: costs, pay trends, anomalies (Y4.1). */
export function ReportingClient({ initialPeriods, bills }: ReportingClientProps) {
  const [hasAnimated, setHasAnimated] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setHasAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const hasPayData = initialPeriods.some(
    (p) => p.finalPayPence > 0 || p.nhsEarningsPence > 0 || p.privateEarningsPence > 0
  );
  const hasAnyData =
    hasPayData ||
    bills.labSummary.totalCount > 0 ||
    bills.supplierSummary.totalCount > 0 ||
    bills.dentistPay.length > 0;

  if (!hasAnyData) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No reporting data yet"
        description="Once lab bills, supplier invoices, and pay periods are recorded, analytics will appear here."
      />
    );
  }

  const payChartData = initialPeriods.map((p) => ({
    period: periodLabel(p),
    "NHS earnings": p.nhsEarningsPence,
    "Private earnings": p.privateEarningsPence,
    "Final pay": p.finalPayPence,
  }));

  const costTrendData = bills.monthlyTotals.map((m) => ({
    period: `${monthShortLabel(m.month)} ${String(m.year).slice(2)}`,
    "Lab bills": m.labTotalPence,
    "Supplier invoices": m.supplierTotalPence,
  }));

  const dentistPeriodKeys = [...new Set(bills.dentistPay.map((d) => `${d.year}-${d.month}`))].sort();
  const dentistTrendData = dentistPeriodKeys.map((key) => {
    const parts = key.split("-").map(Number);
    const year = parts[0] ?? 0;
    const month = parts[1] ?? 0;
    const monthEntries = bills.dentistPay.filter((d) => d.year === year && d.month === month);
    const isDraft = monthEntries.some((e) => e.periodStatus !== "LOCKED");
    const row: Record<string, string | number> = {
      period: `${monthShortLabel(month)} ${String(year).slice(2)}${isDraft ? "*" : ""}`,
    };
    for (const name of bills.dentistNames) {
      const entry = monthEntries.find((e) => e.dentistName === name);
      row[name] = Math.max(0, entry?.finalPayPence ?? 0);
    }
    return row;
  });

  const labNameTotals = new Map<string, number>();
  for (const row of bills.labByMonth) {
    labNameTotals.set(row.entityName, (labNameTotals.get(row.entityName) ?? 0) + row.totalPence);
  }
  const labBarData = [...labNameTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, totalPence]) => ({ name, totalPence }));

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total lab bills"
          value={formatMoneyGBP(bills.labSummary.totalPence)}
          detail={`${bills.labSummary.totalCount} bills`}
        />
        <SummaryCard
          label="Lab bills unpaid"
          value={formatMoneyGBP(bills.labSummary.unpaidPence)}
          detail={`${bills.labSummary.unpaidCount} unpaid`}
          danger
        />
        <SummaryCard
          label="Total supplier invoices"
          value={formatMoneyGBP(bills.supplierSummary.totalPence)}
          detail={`${bills.supplierSummary.totalCount} invoices`}
        />
        <SummaryCard
          label="Invoices unpaid"
          value={formatMoneyGBP(bills.supplierSummary.unpaidPence)}
          detail={`${bills.supplierSummary.unpaidCount} unpaid`}
          danger
        />
      </div>

      {hasPayData ? (
        <Card>
          <CardHeader>
            <CardTitle>Pay period totals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={payChartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--color-border-subtle)" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} axisLine={{ stroke: "var(--color-border-subtle)" }} tickLine={false} />
                  <YAxis tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMoneyGBP(v)} width={80} />
                  <Tooltip content={<ThemedTooltip />} cursor={{ stroke: "var(--color-border-subtle)" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-text-secondary)" }} />
                  <Line type="monotone" dataKey="NHS earnings" stroke="var(--color-accent-teal)" strokeWidth={2} dot={false} isAnimationActive={!hasAnimated} />
                  <Line type="monotone" dataKey="Private earnings" stroke="var(--color-accent-amber)" strokeWidth={2} dot={false} isAnimationActive={!hasAnimated} />
                  <Line type="monotone" dataKey="Final pay" stroke="var(--color-primary-500)" strokeWidth={2.5} dot={false} isAnimationActive={!hasAnimated} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {costTrendData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Monthly costs trend</CardTitle>
            <p className="text-body-sm text-(--color-text-secondary)">Lab bills and supplier invoices over time</p>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={costTrendData}>
                  <CartesianGrid stroke="var(--color-border-subtle)" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => formatMoneyGBP(v)} width={80} />
                  <Tooltip content={<ThemedTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="Lab bills" stroke="var(--color-primary-500)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Supplier invoices" stroke="var(--color-accent-amber)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {dentistTrendData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Dentist net pay trend</CardTitle>
            <p className="text-body-sm text-(--color-text-secondary)">All pay periods — draft months marked with *</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dentistTrendData}>
                  <CartesianGrid stroke="var(--color-border-subtle)" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }} />
                  <YAxis tickFormatter={(v: number) => formatMoneyGBP(v)} width={80} />
                  <Tooltip content={<ThemedTooltip />} />
                  <Legend />
                  {bills.dentistNames.map((name, index) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={DENTIST_COLORS[index % DENTIST_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <TablePanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    {bills.dentistNames.map((name) => (
                      <TableHead key={name} className="text-right">{name}</TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.dentistPayTable.map((row) => (
                    <TableRow key={`${row.year}-${row.month}`}>
                      <TableCell>{monthShortLabel(row.month)} {row.year}</TableCell>
                      <TableCell>
                        <Badge variant={row.isDraft ? "neutral" : "success"}>
                          {row.isDraft ? "Draft" : "Finalized"}
                        </Badge>
                      </TableCell>
                      {bills.dentistNames.map((name) => (
                        <TableCellMoney key={name}>
                          {row.values[name] != null ? formatMoneyGBP(row.values[name]) : "—"}
                        </TableCellMoney>
                      ))}
                      <TableCellMoney>{formatMoneyGBP(row.totalPence)}</TableCellMoney>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TablePanel>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {labBarData.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Lab bills by lab</CardTitle>
              <p className="text-body-sm text-(--color-text-secondary)">Total spend per lab</p>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={labBarData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid stroke="var(--color-border-subtle)" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v: number) => formatMoneyGBP(v)} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => formatMoneyGBP(Number(value ?? 0))} />
                    <Bar dataKey="totalPence" fill="var(--color-primary-500)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <TrendingUp className="size-5 text-(--color-brand)" />
            <div>
              <CardTitle>Anomaly detection</CardTitle>
              <p className="text-body-sm text-(--color-text-secondary)">
                Months where lab bills deviate from average ({formatMoneyGBP(Math.round(bills.avgMonthlyLabPence))}/month)
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {bills.labAnomalies.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-(--color-success)">
                <CheckCircle2 className="size-5" />
                <span className="text-body-sm">No significant anomalies detected</span>
              </div>
            ) : (
              <div className="space-y-2">
                {bills.labAnomalies.map((anomaly) => (
                  <div
                    key={anomaly.label}
                    className={`flex items-center justify-between rounded-(--radius-md) px-3 py-2 ${
                      anomaly.isHigh ? "bg-(--color-danger)/10" : "bg-(--color-success)/10"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`size-4 ${anomaly.isHigh ? "text-(--color-danger)" : "text-(--color-success)"}`} />
                      <span className="text-body-sm font-medium">{anomaly.label}</span>
                    </div>
                    <div className="text-right text-body-sm">
                      <span className="font-semibold">{formatMoneyGBP(anomaly.valuePence)}</span>
                      <span className={`ml-2 text-caption ${anomaly.isHigh ? "text-(--color-danger)" : "text-(--color-success)"}`}>
                        ({anomaly.isHigh ? "+" : ""}{formatMoneyGBP(Math.round(anomaly.diffPence))} vs avg)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Outstanding lab bills</CardTitle></CardHeader>
          <CardContent className="p-0">
            <TablePanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lab</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.labUnpaidByEntity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-(--color-success)">
                        <CheckCircle2 className="mr-1 inline size-4" />
                        All lab bills paid
                      </TableCell>
                    </TableRow>
                  ) : (
                    bills.labUnpaidByEntity.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell>{row.name}</TableCell>
                        <TableCellMoney className="text-(--color-danger)">{formatMoneyGBP(row.amountPence)}</TableCellMoney>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TablePanel>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Outstanding supplier invoices</CardTitle></CardHeader>
          <CardContent className="p-0">
            <TablePanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.supplierUnpaidByEntity.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-8 text-center text-(--color-success)">
                        <CheckCircle2 className="mr-1 inline size-4" />
                        All invoices paid
                      </TableCell>
                    </TableRow>
                  ) : (
                    bills.supplierUnpaidByEntity.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell>{row.name}</TableCell>
                        <TableCellMoney className="text-(--color-danger)">{formatMoneyGBP(row.amountPence)}</TableCellMoney>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TablePanel>
          </CardContent>
        </Card>
      </div>

      {bills.labByDentist.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Lab bills by dentist</CardTitle>
            <p className="text-body-sm text-(--color-text-secondary)">Breakdown of lab spending per dentist</p>
          </CardHeader>
          <CardContent className="p-0">
            <TablePanel>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dentist</TableHead>
                    <TableHead>Lab</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Bills</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.labByDentist.map((row) => (
                    <TableRow key={`${row.dentistName}-${row.labName}`}>
                      <TableCell>{row.dentistName}</TableCell>
                      <TableCell>{row.labName}</TableCell>
                      <TableCellMoney>{formatMoneyGBP(row.totalPence)}</TableCellMoney>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TablePanel>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
