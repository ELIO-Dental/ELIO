"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, formatMoneyGBP } from "@elio/ui";
import type { FlowDashboardRow, FlowDashboardStats } from "@/lib/flow-service";

const STATUS_COLORS: Record<string, string> = {
  new: "var(--color-info)",
  thinking: "var(--color-warning)",
  stuck: "var(--color-warning)",
  "failed-finance": "var(--color-danger)",
  "price-shopping": "var(--color-warning)",
  "bad-experience": "var(--color-danger)",
  "out-of-budget": "var(--color-warning)",
  converted: "var(--color-success)",
  completed: "var(--color-success)",
  declined: "var(--color-text-tertiary)",
};

function bucketDays(days: number): string {
  if (days <= 7) return "0–7d";
  if (days <= 30) return "8–30d";
  if (days <= 90) return "31–90d";
  return "90d+";
}

function bucketPlanValue(pence: number): string {
  if (pence <= 0) return "£0";
  if (pence < 200_000) return "£0–2k";
  if (pence < 500_000) return "£2k–5k";
  if (pence < 1_000_000) return "£5k–10k";
  return "£10k+";
}

export function DashboardCharts({
  rows,
  stats,
}: {
  rows: FlowDashboardRow[];
  stats: FlowDashboardStats;
}) {
  const plansGiven = rows.filter((r) => r.hasPlan).length;
  const funnel = [
    { name: "Consultations", value: stats.totalConsultations },
    { name: "Attended", value: stats.attended },
    { name: "Plans given", value: plansGiven },
    { name: "Converted", value: stats.converted },
  ];

  const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.statusLabel] = (acc[row.statusLabel] ?? 0) + 1;
    return acc;
  }, {});
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const pipelineByStatus = rows
    .filter((r) => !["converted", "completed"].includes(r.statusKey))
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.statusLabel] = (acc[row.statusLabel] ?? 0) + row.planValuePence;
      return acc;
    }, {});
  const pipelineData = Object.entries(pipelineByStatus).map(([name, value]) => ({
    name,
    value: value / 100,
  }));

  const daysBuckets = rows.reduce<Record<string, number>>((acc, row) => {
    const b = bucketDays(row.daysSinceConsult);
    acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  const daysData = ["0–7d", "8–30d", "31–90d", "90d+"].map((name) => ({
    name,
    value: daysBuckets[name] ?? 0,
  }));

  const planBuckets = rows.reduce<Record<string, number>>((acc, row) => {
    const b = bucketPlanValue(row.planValuePence);
    acc[b] = (acc[b] ?? 0) + 1;
    return acc;
  }, {});
  const planData = ["£0", "£0–2k", "£2k–5k", "£5k–10k", "£10k+"].map((name) => ({
    name,
    value: planBuckets[name] ?? 0,
  }));

  const avgDays =
    rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.daysSinceConsult, 0) / rows.length) : 0;
  const attendanceRate =
    stats.totalConsultations > 0 ? Math.round((stats.attended / stats.totalConsultations) * 100) : 0;
  const planRate = stats.totalConsultations > 0 ? Math.round((plansGiven / stats.totalConsultations) * 100) : 0;
  const avgPlan =
    plansGiven > 0
      ? Math.round(rows.filter((r) => r.hasPlan).reduce((s, r) => s + r.planValuePence, 0) / plansGiven)
      : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Conversion funnel">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={funnel}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Patients by status">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {statusData.map((entry, i) => (
                  <Cell key={entry.name} fill={Object.values(STATUS_COLORS)[i % 8]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pipeline value by status (unconverted)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pipelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
              <Tooltip formatter={(v) => formatMoneyGBP(Number(v) * 100)} />
              <Bar dataKey="value" fill="var(--color-warning)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Days since consultation">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={daysData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--color-info)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Plan value distribution" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={planData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <QuickStat label="Avg plan value" value={formatMoneyGBP(avgPlan)} />
        <QuickStat label="Avg days since consult" value={`${avgDays}d`} />
        <QuickStat label="Attendance rate" value={`${attendanceRate}%`} />
        <QuickStat label="Plan rate" value={`${planRate}%`} />
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-body-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) px-4 py-3">
      <p className="text-caption text-(--color-text-tertiary)">{label}</p>
      <p className="mt-1 text-body font-semibold tabular-nums text-(--color-text-primary)">{value}</p>
    </div>
  );
}
