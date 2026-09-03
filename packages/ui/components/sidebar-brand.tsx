"use client";

import { cn } from "../lib/cn";
import { Sparkles } from "lucide-react";
import { useIsDark } from "../hooks/use-is-dark";

export interface SidebarBrandProps {
  title: string;
  collapsed: boolean;
  testId?: string;
  /** Shown when the sidebar is collapsed — defaults to the first letter of `title`. */
  shortLabel?: string;
  /** Show ELIO portal star mark beside the wordmark. */
  showLogo?: boolean;
  /** Optional logo image URL (Portal brand or practice logo) — light / default. */
  logoUrl?: string;
  /** Dark-theme wordmark (white text). Falls back to logoUrl. */
  logoDarkUrl?: string;
  /** When true with logoUrl, hide the text title (logo already includes wordmark). */
  logoOnly?: boolean;
  /** Collapsed mark image (square favicon) — falls back to logoUrl. */
  collapsedLogoUrl?: string;
}

/** Centered sidebar wordmark — ELIO PORTAL / ELIO PAY / ELIO PLANS / ELIO FLOW. */
export function SidebarBrand({
  title,
  collapsed,
  testId,
  shortLabel,
  showLogo = false,
  logoUrl,
  logoDarkUrl,
  logoOnly = false,
  collapsedLogoUrl,
}: SidebarBrandProps) {
  const isDark = useIsDark();
  const abbreviated = (shortLabel ?? (title.replace(/[^A-Z]/g, "").slice(0, 2) || title.charAt(0))).toUpperCase();
  const activeLogo = isDark && logoDarkUrl ? logoDarkUrl : logoUrl;
  const markUrl = collapsedLogoUrl ?? activeLogo;

  if (collapsed) {
    return (
      <span
        title={title}
        className="flex size-11 items-center justify-center overflow-hidden rounded-(--radius-md) text-caption font-bold text-(--color-primary-600)"
      >
        {markUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={markUrl} alt="" className="size-full object-contain" />
        ) : showLogo ? (
          <Sparkles className="size-4" aria-hidden />
        ) : (
          abbreviated
        )}
      </span>
    );
  }

  return (
    <span
      data-testid={testId}
      className={cn(
        "flex w-full items-center justify-center gap-2.5 px-1",
        title.length > 12 ? "text-body-sm" : "text-body"
      )}
    >
      {activeLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeLogo}
          alt={logoOnly ? title : ""}
          className={cn(
            "shrink-0 object-contain object-left",
            logoOnly ? "h-11 w-auto max-w-[min(100%,240px)] sm:h-12 sm:max-w-[260px]" : "h-8 w-auto max-w-[120px]"
          )}
        />
      ) : showLogo ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-600)">
          <Sparkles className="size-4" aria-hidden />
        </span>
      ) : null}
      {logoOnly ? (
        <span className="sr-only">{title}</span>
      ) : (
        <span className="font-bold leading-tight tracking-[0.12em] text-(--color-text-primary)">{title}</span>
      )}
    </span>
  );
}
