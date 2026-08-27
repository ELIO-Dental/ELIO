"use client";

// Server Components can't pass a `format` callback across the RSC boundary
// to StatCard (a Client Component) — same fix pattern as
// apps/plans/components/money-stat-card.tsx.
import { StatCard } from "@elio/ui";

function money(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
  const format = isMoney ? money : suffix ? (v: number) => `${v.toLocaleString()}${suffix}` : undefined;
  return <StatCard label={label} value={value} format={format} />;
}
