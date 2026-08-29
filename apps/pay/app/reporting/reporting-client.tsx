"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Card, CardHeader, CardTitle, CardContent, EmptyState } from "@elio/ui";
import { BarChart3 } from "lucide-react";
import type { ReportingPeriodPoint } from "@/lib/pay-service";

function money(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function periodLabel(p: ReportingPeriodPoint) {
  return new Date(p.periodStart).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/** §5.15 tooltip — bg-surface-raised + shadow-lg + radius-md card, never Recharts' default. */
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
          <div key={entry.dataKey as string} className="flex items-center gap-2 text-caption text-(--color-text-secondary)">
            <span className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.name}:</span>
            <span className="font-medium text-(--color-text-primary)">{money(Number(entry.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface ReportingClientProps {
  initialPeriods: ReportingPeriodPoint[];
}

/**
 * §5.15 chart spec: Recharts line chart, primary-500 for the main/only series
 * (Final pay — the totals line), accent teal/amber for the two supporting
 * series (NHS, Private) in that order. `hasAnimated` state makes the draw-in
 * fire once per mount and never replay — this screen has no filters yet, but
 * a future date-range filter must read this flag (not re-enable animation)
 * before triggering a data refetch, per §5.15/§6.3's "no replay on filter
 * change" rule.
 */
export function ReportingClient({ initialPeriods }: ReportingClientProps) {
  const hasAnyData = initialPeriods.some((p) => p.finalPayPence > 0 || p.nhsEarningsPence > 0 || p.privateEarningsPence > 0);
  // F.4 Final QA (2026-08-29): reading a ref's `.current` directly during
  // render (in the JSX below) is a real eslint(react-hooks/refs) violation —
  // refs are for values outside the render/commit cycle, and reading one
  // mid-render can produce a stale/inconsistent value under concurrent
  // rendering. `hasAnimated` (state, not a ref) captures the exact same
  // "flip once after first mount, never again" behavior this screen's own
  // comment describes, without touching a ref during render.
  const [hasAnimated, setHasAnimated] = React.useState(false);
  React.useEffect(() => {
    // Deferred via rAF rather than called synchronously in the effect body —
    // eslint(react-hooks/set-state-in-effect) flags a same-tick setState
    // inside an effect regardless of what it's replacing; scheduling it for
    // the next frame keeps the exact same "flip once after first paint,
    // never again" behavior without a synchronous update inside the effect.
    const id = requestAnimationFrame(() => setHasAnimated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (initialPeriods.length === 0 || !hasAnyData) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No reporting data yet"
        description="Once pay periods have calculated payslips, NHS, private, and total pay trends will appear here."
      />
    );
  }

  const data = initialPeriods.map((p) => ({
    period: periodLabel(p),
    "NHS earnings": p.nhsEarningsPence,
    "Private earnings": p.privateEarningsPence,
    "Final pay": p.finalPayPence,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay period totals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-border-subtle)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }}
                axisLine={{ stroke: "var(--color-border-subtle)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--color-text-tertiary)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => money(v)}
                width={80}
              />
              <Tooltip content={<ThemedTooltip />} cursor={{ stroke: "var(--color-border-subtle)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--color-text-secondary)" }} />
              <Line
                type="monotone"
                dataKey="NHS earnings"
                stroke="var(--color-accent-teal)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!hasAnimated}
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Private earnings"
                stroke="var(--color-accent-amber)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={!hasAnimated}
                animationDuration={500}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="Final pay"
                stroke="var(--color-primary-500)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={!hasAnimated}
                animationDuration={500}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
