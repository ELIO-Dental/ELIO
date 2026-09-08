"use client";

import { cn, formatMoneyGBP } from "@elio/ui";

export type PlansStatTone = "default" | "success" | "warning" | "danger" | "accent";

/** Modern KPI tile — matches Flow dashboard density without Framer count-up lag. */
export function PlansStatCard({
  label,
  value,
  money,
  tone = "default",
  className,
}: {
  label: string;
  value: number;
  money?: boolean;
  tone?: PlansStatTone;
  className?: string;
}) {
  const display = money
    ? formatMoneyGBP(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : value.toLocaleString("en-GB");

  const valueTone =
    tone === "success"
      ? "text-(--color-success)"
      : tone === "warning"
        ? "text-(--color-warning)"
        : tone === "danger"
          ? "text-(--color-danger)"
          : tone === "accent"
            ? "text-(--color-primary-600)"
            : "text-(--color-text-primary)";

  return (
    <div
      className={cn(
        "flex min-h-[5.75rem] flex-col justify-between rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) px-4 py-3.5 shadow-(--shadow-xs) transition-[box-shadow,border-color] duration-150 hover:border-(--color-border) hover:shadow-(--shadow-sm)",
        className
      )}
      data-testid={`plans-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="text-[10px] font-semibold tracking-[0.08em] text-(--color-text-tertiary) uppercase sm:text-caption">
        {label}
      </p>
      <p className={cn("mt-2 text-h2 font-semibold tracking-tight tabular-nums sm:text-h1", valueTone)}>{display}</p>
    </div>
  );
}
