"use client";

// Server Components can't pass a `format` callback across the RSC boundary
// to StatCard (a Client Component) — same fix pattern as
// apps/plans/components/money-stat-card.tsx.
import { cn, formatMoneyGBP } from "@elio/ui";

export type FlowStatTone = "default" | "success" | "warning" | "accent";

export function FlowStatCard({
  label,
  value,
  suffix,
  money: isMoney,
  tone = "default",
  className,
}: {
  label: string;
  value: number;
  suffix?: string;
  money?: boolean;
  tone?: FlowStatTone;
  className?: string;
}) {
  // Whole pounds — matches classic ElioFlow formatCurrency (0 fraction digits).
  const moneyPence = Math.round(value / 100) * 100;
  const display = isMoney
    ? formatMoneyGBP(moneyPence, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : suffix
      ? `${value.toLocaleString("en-GB")}${suffix}`
      : value.toLocaleString("en-GB");

  const valueTone =
    tone === "success"
      ? "text-(--color-success)"
      : tone === "warning"
        ? "text-(--color-warning)"
        : tone === "accent"
          ? "text-(--color-primary-600)"
          : "text-(--color-text-primary)";

  return (
    <div
      className={cn(
        "flex min-h-[5.5rem] flex-col justify-between rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) px-3.5 py-3 shadow-(--shadow-xs) transition-[box-shadow,border-color] duration-150 hover:border-(--color-border) hover:shadow-(--shadow-sm) sm:min-h-[6rem] sm:px-4 sm:py-3.5",
        className
      )}
    >
      <p className="text-[10px] font-semibold tracking-[0.08em] text-(--color-text-tertiary) uppercase sm:text-caption">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 tabular-nums font-semibold tracking-tight",
          isMoney ? "text-[1.15rem] leading-tight sm:text-h3" : "text-h3 sm:text-h2",
          valueTone
        )}
        data-testid={`flow-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {display}
      </p>
    </div>
  );
}
