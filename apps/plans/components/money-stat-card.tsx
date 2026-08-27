"use client";

// Server Components can't pass function props (e.g. a `format` callback)
// across the RSC boundary to a Client Component — StatCard is "use client".
// This thin client wrapper defines the money formatter locally so pages stay
// server components and only pass serializable numeric props down.
import { StatCard, type StatCardProps } from "@elio/ui";

function money(pence: number) {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MoneyStatCard(props: Omit<StatCardProps, "format">) {
  return <StatCard {...props} format={money} />;
}
