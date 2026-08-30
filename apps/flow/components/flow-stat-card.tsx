"use client";

// Server Components can't pass a `format` callback across the RSC boundary
// to StatCard (a Client Component) — same fix pattern as
// apps/plans/components/money-stat-card.tsx.
import { StatCard, formatMoneyGBP } from "@elio/ui";

export function FlowStatCard({
  label,
  value,
  suffix,
  money: isMoney,
}: {
  label: string;
  value: number;
  suffix?: string;
  money?: boolean;
}) {
  const format = isMoney
    ? (v: number) => formatMoneyGBP(v, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : suffix
      ? (v: number) => `${v.toLocaleString()}${suffix}`
      : undefined;
  return <StatCard label={label} value={value} format={format} />;
}
