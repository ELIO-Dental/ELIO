"use client";

// Server Components can't pass a raw icon component reference (a function)
// across the RSC boundary to a Client Component — EmptyState is "use client".
// This thin client wrapper imports the icon locally so pages stay server
// components and only pass serializable string props down. Same fix pattern
// as MoneyStatCard (apps/plans/components/money-stat-card.tsx).
import { EmptyState, type EmptyStateProps } from "@elio/ui";
import { CheckCircle2 } from "lucide-react";

export function ActionRequiredEmptyState(props: Omit<EmptyStateProps, "icon">) {
  return <EmptyState {...props} icon={CheckCircle2} />;
}
