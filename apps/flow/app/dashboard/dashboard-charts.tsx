"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoneyGBP } from "@elio/ui";
import type { FlowDashboardRow, FlowDashboardStats } from "@/lib/flow-service";

const FUNNEL_COLORS = [
  "var(--color-primary-400)",
  "var(--color-primary-500)",
  "var(--color-primary-600)",
  "var(--color-success)",
];

const STATUS_COLORS: Record<string, string> = {
  New: "var(--color-info)",
  Thinking: "var(--color-warning)",
  "Failed Finance": "var(--color-danger)",
  "Price Shopping": "#f59e0b",
  "Bad Experience": "#e11d48",
  "Out of Budget": "#d97706",
  Converted: "var(--color-success)",
  Completed: "#059669",
  Declined: "var(--color-text-tertiary)",
};

function bucketDays(days: number): string {
  if (days <= 7) return "0–7 days";
  if (days <= 14) return "8–14 days";
  if (days <= 30) return "15–30 days";
  if (days <= 60) return "31–60 days";
  return "60+ days";
}

/** Legacy ElioFlow plan-value chart excluded £0 plans. */
function bucketPlanValue(pence: number): string | null {
  const pounds = pence / 100;
  if (pounds <= 0) return null;
  if (pounds <= 500) return "£0–£500";
  if (pounds <= 1000) return "£501–£1,000";
  if (pounds <= 2500) return "£1,001–£2,500";
  if (pounds <= 5000) return "£2,501–£5,000";
  return "£5,000+";
}

function ChartTooltip({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: { value: number; name?: string; payload?: { dropOff?: string | null } }[];
  label?: string;
  money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!;
  const value = money ? formatMoneyGBP(Math.round(Number(row.value) * 100), { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : Number(row.value).toLocaleString("en-GB");
  return (
    <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 shadow-(--shadow-md)">
      <p className="text-caption font-medium text-(--color-text-secondary)">{label ?? row.name}</p>
      <p className="mt-0.5 text-body-sm font-semibold tabular-nums text-(--color-text-primary)">{value}</p>
      {row.payload?.dropOff ? (
        <p className="mt-0.5 text-caption text-(--color-text-tertiary)">Drop-off {row.payload.dropOff}</p>
      ) : null}
    </div>
  );
}

export function DashboardCharts({
  rows,
  stats,
}: {
  rows: FlowDashboardRow[];
  stats: FlowDashboardStats;
}) {
  const plansGiven = rows.filter((r) => r.hasPlan).length;
  const funnelBase = [
    { name: "Consultations", value: stats.totalConsultations },
    { name: "Attended", value: stats.attended },
    { name: "Plans given", value: plansGiven },
    { name: "Converted", value: stats.converted },
  ];
  const funnel = funnelBase.map((step, i) => {
    const prev = i === 0 ? null : funnelBase[i - 1]!.value;
    const dropOff =
      prev && prev > 0 ? `${Math.round(((prev - step.value) / prev) * 100)}%` : null;
    return { ...step, dropOff };
  });

  const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.statusLabel] = (acc[row.statusLabel] ?? 0) + 1;
    return acc;
  }, {});
  const statusData = Object.entries(statusCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const pipelineByStatus = rows
    .filter((r) => !["converted", "completed"].includes(r.statusKey))
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.statusLabel] = (acc[row.statusLabel] ?? 0) + row.planValuePence;
      return acc;
    }, {});
  const pipelineData = Object.entries(pipelineByStatus)
    .map(([name, value]) => ({ name, value: value / 100 }))
    .sort((a, b) => b.value - a.value);

  const daysBuckets = rows.reduce<Record<string, number>>((acc, row) => {
    const b = bucketDays(row.daysSinceConsult);
    acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  const daysData = ["0–7 days", "8–14 days", "15–30 days", "31–60 days", "60+ days"].map((name) => ({
    name,
    value: daysBuckets[name] ?? 0,
  }));

  const planBuckets = rows.reduce<Record<string, number>>((acc, row) => {
    const b = bucketPlanValue(row.planValuePence);
    if (!b) return acc;
    acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  const planData = ["£0–£500", "£501–£1,000", "£1,001–£2,500", "£2,501–£5,000", "£5,000+"].map((name) => ({
    name,
    value: planBuckets[name] ?? 0,
  }));

  const convertedRows = rows.filter((r) => ["converted", "completed"].includes(r.statusKey));
  const avgDaysToConvert =
    convertedRows.length > 0
      ? Math.round(convertedRows.reduce((s, r) => s + r.daysSinceConsult, 0) / convertedRows.length)
      : null;
  const attendanceRate =
    stats.totalConsultations > 0 ? Math.round((stats.attended / stats.totalConsultations) * 100) : 0;
  const planRate = stats.attended > 0 ? Math.round((plansGiven / stats.attended) * 100) : 0;
  const avgPlan =
    plansGiven > 0
      ? Math.round(rows.filter((r) => r.hasPlan).reduce((s, r) => s + r.planValuePence, 0) / plansGiven)
      : 0;

  const axisTick = { fill: "var(--color-text-tertiary)", fontSize: 11 };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Conversion funnel" subtitle="Drop-off % vs previous stage">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={funnel} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={56}>
                {funnel.map((_, i) => (
                  <Cell key={funnel[i]!.name} fill={FUNNEL_COLORS[i] ?? FUNNEL_COLORS[0]} />
                ))}
                <LabelList
                  dataKey="dropOff"
                  position="top"
                  className="fill-(--color-text-tertiary) text-[10px]"
                  formatter={(v: unknown) => (typeof v === "string" && v ? `↓${v}` : "")}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Patients by status">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={2}
                stroke="var(--color-surface)"
                strokeWidth={2}
              >
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "var(--color-primary-400)"} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
            {statusData.slice(0, 6).map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5 text-caption text-(--color-text-secondary)">
                <span
                  className="size-2 rounded-full"
                  style={{ background: STATUS_COLORS[s.name] ?? "var(--color-primary-400)" }}
                />
                {s.name}
                <span className="tabular-nums text-(--color-text-tertiary)">{s.value}</span>
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Pipeline value by status" subtitle="Unconverted plan value">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipelineData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" horizontal={false} />
              <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `£${v}`} />
              <YAxis type="category" dataKey="name" width={110} tick={axisTick} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip money />} />
              <Bar dataKey="value" fill="var(--color-warning)" radius={[0, 8, 8, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Days since consultation">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={daysData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" fill="var(--color-info)" radius={[8, 8, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Plan value distribution" subtitle="Excludes £0 plans (legacy chart)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={planData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" fill="var(--color-success)" radius={[8, 8, 0, 0]} maxBarSize={64} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <QuickStat label="Avg plan value" value={formatMoneyGBP(avgPlan, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} />
        <QuickStat
          label="Avg days to convert"
          value={avgDaysToConvert != null ? `${avgDaysToConvert} days` : "—"}
        />
        <QuickStat label="Attendance rate" value={`${attendanceRate}%`} />
        <QuickStat label="Plan rate (of attended)" value={`${planRate}%`} />
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) shadow-(--shadow-xs) transition-shadow hover:shadow-(--shadow-sm) ${className ?? ""}`}
    >
      <header className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/40 px-4 py-3 sm:px-5 sm:py-3.5">
        <h3 className="text-body-sm font-semibold text-(--color-text-primary)">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-caption text-(--color-text-tertiary)">{subtitle}</p> : null}
      </header>
      <div className="px-2 py-3 sm:px-4 sm:py-4">{children}</div>
    </section>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) px-3.5 py-3 shadow-(--shadow-xs) sm:px-4 sm:py-3.5">
      <p className="text-[10px] font-semibold tracking-[0.08em] text-(--color-text-tertiary) uppercase sm:text-caption">
        {label}
      </p>
      <p className="mt-1.5 text-body font-semibold tabular-nums tracking-tight text-(--color-text-primary) sm:text-h3">
        {value}
      </p>
    </div>
  );
}
