"use client";

// Server Components can't pass function props (e.g. a `format` callback)
// across the RSC boundary to a Client Component — StatCard is "use client".
// This thin client wrapper defines the money formatter locally so pages stay
// server components and only pass serializable numeric props down.
import { StatCard, type StatCardProps, formatMoneyGBP } from "@elio/ui";

export function MoneyStatCard(props: Omit<StatCardProps, "format">) {
  return <StatCard {...props} format={formatMoneyGBP} />;
}
