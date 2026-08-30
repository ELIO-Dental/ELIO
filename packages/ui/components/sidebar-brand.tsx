"use client";

import { cn } from "../lib/cn";
import { Sparkles } from "lucide-react";

export interface SidebarBrandProps {
  title: string;
  collapsed: boolean;
  testId?: string;
  /** Shown when the sidebar is collapsed — defaults to the first letter of `title`. */
  shortLabel?: string;
  /** Show ELIO portal star mark beside the wordmark. */
  showLogo?: boolean;
}

/** Centered sidebar wordmark — ELIO PORTAL / ELIO PAY / ELIO PLANS / ELIO FLOW. */
export function SidebarBrand({ title, collapsed, testId, shortLabel, showLogo = false }: SidebarBrandProps) {
  const abbreviated = (shortLabel ?? (title.replace(/[^A-Z]/g, "").slice(0, 2) || title.charAt(0))).toUpperCase();

  if (collapsed) {
    return (
      <span
        title={title}
        className="flex size-10 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-caption font-bold text-(--color-primary-600)"
      >
        {showLogo ? <Sparkles className="size-4" aria-hidden /> : abbreviated}
      </span>
    );
  }

  return (
    <span
      data-testid={testId}
      className={cn(
        "flex w-full items-center justify-center gap-2.5",
        title.length > 12 ? "text-body-sm" : "text-body"
      )}
    >
      {showLogo && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-600)">
          <Sparkles className="size-4" aria-hidden />
        </span>
      )}
      <span className="font-bold leading-tight tracking-[0.12em] text-(--color-text-primary)">{title}</span>
    </span>
  );
}
