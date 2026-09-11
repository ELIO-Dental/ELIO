"use client";

import type { LucideIcon } from "lucide-react";
import { cn, formatMoneyGBP } from "@elio/ui";

export type PayStatTone = "default" | "success" | "warning" | "danger" | "accent";

const TONE_TEXT: Record<PayStatTone, string> = {
  default: "text-(--color-text-primary)",
  success: "text-(--color-success)",
  warning: "text-(--color-warning)",
  danger: "text-(--color-danger)",
  accent: "text-(--color-primary-600)",
};

const TONE_ICON_BG: Record<PayStatTone, string> = {
  default: "bg-(--color-bg-subtle) text-(--color-text-secondary)",
  success: "bg-(--color-success)/10 text-(--color-success)",
  warning: "bg-(--color-warning)/10 text-(--color-warning)",
  danger: "bg-(--color-danger)/10 text-(--color-danger)",
  accent: "bg-(--color-primary-50) text-(--color-primary-600)",
};

/**
 * KPI tile matching apps/plans' PlansStatCard / apps/flow's FlowStatCard exactly —
 * same chrome, sizing, and tone system, so the three module dashboards read as one
 * consistent product instead of each having its own stat-card shape (found live:
 * this app's dashboard was the only one still using an older icon-in-a-box Card
 * pattern instead of this shared tile spec). Icon slot is additive — Plans/Flow
 * don't use one, but Pay's existing dashboard icons (Users, FileText, ...) carried
 * real information worth keeping.
 */
export function PayStatCard({
  label,
  value,
  money,
  tone = "default",
  icon: Icon,
  className,
}: {
  label: string;
  value: number | string;
  money?: boolean;
  tone?: PayStatTone;
  icon?: LucideIcon;
  className?: string;
}) {
  const display =
    typeof value === "number"
      ? money
        ? formatMoneyGBP(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : value.toLocaleString("en-GB")
      : value;

  return (
    <div
      className={cn(
        "flex min-h-[5.75rem] flex-col justify-between rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) px-4 py-3.5 shadow-(--shadow-xs) transition-[box-shadow,border-color] duration-150 hover:border-(--color-border) hover:shadow-(--shadow-sm)",
        className
      )}
      data-testid={`pay-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-[0.08em] text-(--color-text-tertiary) uppercase sm:text-caption">
          {label}
        </p>
        {Icon ? (
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-(--radius-md)", TONE_ICON_BG[tone])}>
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className={cn("mt-2 truncate text-h2 font-semibold tracking-tight tabular-nums sm:text-h1", TONE_TEXT[tone])}>
        {display}
      </p>
    </div>
  );
}
