"use client";

import * as React from "react";
import { cn } from "../lib/cn";
import { getModuleColor, type ModuleId } from "../lib/get-module-color";
import { useIsDark } from "../hooks/use-is-dark";

export function ModuleIconBadge({
  moduleId,
  children,
  className,
  size = "md",
}: {
  moduleId: ModuleId;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const isDark = useIsDark();
  const color = getModuleColor(moduleId);
  const badge = isDark ? color.badgeDark : color.badgeLight;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-(--radius-md) font-semibold",
        size === "sm" && "size-8 text-body-sm",
        size === "md" && "size-10 text-body-sm",
        size === "lg" && "size-12 text-body",
        className
      )}
      style={{ backgroundColor: badge.bg, color: badge.fg }}
    >
      {children}
    </span>
  );
}

/** Rounded accent chip — tinted module bg with full-saturation icon (launcher arrows, etc.). */
export function ModuleAccentChip({
  moduleId,
  children,
  className,
}: {
  moduleId: ModuleId;
  children: React.ReactNode;
  className?: string;
}) {
  const isDark = useIsDark();
  const color = getModuleColor(moduleId);
  const badge = isDark ? color.badgeDark : color.badgeLight;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-(--radius-full)", className)}
      style={{ backgroundColor: badge.bg, color: color.hex }}
    >
      {children}
    </span>
  );
}
