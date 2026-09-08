"use client";

// Server Components can't pass a `format` callback across the RSC boundary
// to StatCard (a Client Component) — same fix pattern as
// apps/plans/components/money-stat-card.tsx.
import { cn, formatMoneyGBP } from "@elio/ui";

export function FlowStatCard({
  label,
  value,
  suffix,
  money: isMoney,
  className,
}: {
  label: string;
  value: number;
  suffix?: string;
  money?: boolean;
  className?: string;
}) {
  const display = isMoney
    ? formatMoneyGBP(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : suffix
      ? `${value.toLocaleString("en-GB")}${suffix}`
      : value.toLocaleString("en-GB");

  return (
    <div
      className={cn(
        "rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) px-4 py-3.5 shadow-(--shadow-xs)",
        className
      )}
    >
      <p className="text-caption font-medium tracking-wide text-(--color-text-tertiary) uppercase">{label}</p>
      <p
        className={cn(
          "mt-1.5 tabular-nums font-semibold text-(--color-text-primary)",
          isMoney ? "text-h3 tracking-tight" : "text-h2 tracking-tight"
        )}
        data-testid={`flow-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {display}
      </p>
    </div>
  );
}
