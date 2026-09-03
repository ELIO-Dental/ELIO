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
  /** Light-surface wordmark (dark text). */
  logoUrl?: string;
  /** Dark-surface wordmark (light/white text). */
  logoDarkUrl?: string;
  /** When true with logoUrl, hide the text title (logo already includes wordmark). */
  logoOnly?: boolean;
  /** Collapsed mark image (square favicon) — falls back to logoUrl. */
  collapsedLogoUrl?: string;
}

/**
 * Theme-aware logos use CSS tied to `data-theme` (same rules as theme.css).
 * Both images share one fixed box so light/dark render the same size and stay centered.
 */
function ThemeAwareLogo({
  lightSrc,
  darkSrc,
  alt,
  className,
}: {
  lightSrc: string;
  darkSrc?: string;
  alt: string;
  className?: string;
}) {
  if (!darkSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={lightSrc} alt={alt} className={cn("object-contain", className)} />;
  }

  return (
    <span className={cn("relative grid place-items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={lightSrc}
        alt={alt}
        className="elio-brand-logo-light absolute inset-0 m-auto h-full w-full object-contain object-center"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={darkSrc}
        alt=""
        aria-hidden
        className="elio-brand-logo-dark absolute inset-0 m-auto h-full w-full object-contain object-center"
      />
    </span>
  );
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
  const abbreviated = (shortLabel ?? (title.replace(/[^A-Z]/g, "").slice(0, 2) || title.charAt(0))).toUpperCase();
  const markLight = collapsedLogoUrl ?? logoUrl;
  const markDark = collapsedLogoUrl ? undefined : logoDarkUrl;

  if (collapsed) {
    return (
      <span
        title={title}
        className="flex size-12 items-center justify-center overflow-hidden rounded-(--radius-md) text-caption font-bold text-(--color-primary-600)"
      >
        {markLight ? (
          <ThemeAwareLogo lightSrc={markLight} darkSrc={markDark} alt="" className="size-10" />
        ) : showLogo ? (
          <Sparkles className="size-5" aria-hidden />
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
        "flex h-full w-full items-center justify-center gap-2.5 px-1",
        title.length > 12 ? "text-body-sm" : "text-body"
      )}
    >
      {logoUrl ? (
        <ThemeAwareLogo
          lightSrc={logoUrl}
          darkSrc={logoDarkUrl}
          alt={logoOnly ? title : ""}
          className={cn(
            "shrink-0",
            // Fixed box — both theme PNGs are normalized to the same canvas so sizes match.
            logoOnly ? "h-12 w-[220px] sm:h-14 sm:w-[260px]" : "h-8 w-[120px]"
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
