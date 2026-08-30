"use client";

import { cn } from "../lib/cn";

export interface SidebarBrandProps {
  title: string;
  collapsed: boolean;
  testId?: string;
  /** Shown when the sidebar is collapsed — defaults to the first letter of `title`. */
  shortLabel?: string;
}

/** Centered sidebar wordmark — ELIO PORTAL / ELIO PAY / ELIO PLANS / ELIO FLOW. */
export function SidebarBrand({ title, collapsed, testId, shortLabel }: SidebarBrandProps) {
  const abbreviated = (shortLabel ?? (title.replace(/[^A-Z]/g, "").slice(0, 2) || title.charAt(0))).toUpperCase();

  if (collapsed) {
    return (
      <span
        title={title}
        className="flex size-10 items-center justify-center rounded-(--radius-md) bg-(--color-border-subtle) text-caption font-bold tracking-wider text-(--color-text-primary)"
      >
        {abbreviated}
      </span>
    );
  }

  return (
    <span
      data-testid={testId}
      className={cn(
        "block w-full text-center text-body font-bold leading-tight tracking-[0.14em] text-(--color-text-primary)",
        title.length > 12 ? "text-body-sm tracking-[0.1em]" : "text-body"
      )}
    >
      {title}
    </span>
  );
}
