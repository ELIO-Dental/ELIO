"use client";

import { cn } from "../lib/cn";
import { Sparkles } from "lucide-react";

export interface SidebarBrandProps {
  title: string;
  /** Optional clinic / practice name under the module title (AuraPay parity). */
  subtitle?: string;
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
  /** `lg` = large centered wordmark for Portal + Pay/Plans/Flow sidebars. */
  logoSize?: "md" | "lg";
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
  subtitle,
  collapsed,
  testId,
  shortLabel,
  showLogo = false,
  logoUrl,
  logoDarkUrl,
  logoOnly = false,
  collapsedLogoUrl,
  /** Larger centered wordmark (module apps: Pay / Plans / Flow). */
  logoSize = "md",
}: SidebarBrandProps) {
  const abbreviated = (shortLabel ?? (title.replace(/[^A-Z]/g, "").slice(0, 2) || title.charAt(0))).toUpperCase();
  const markLight = collapsedLogoUrl ?? logoUrl;
  const markDark = collapsedLogoUrl ? undefined : logoDarkUrl;
  const logoBox =
    logoSize === "lg"
      ? "h-[4.5rem] w-[min(100%,200px)] sm:h-[5rem] sm:w-[min(100%,208px)]"
      : logoOnly
        ? "h-14 w-[min(100%,200px)] sm:h-16 sm:w-[min(100%,220px)]"
        : "h-8 w-[120px]";

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
        logoOnly && subtitle ? "flex-col gap-1" : null,
        title.length > 12 ? "text-body-sm" : "text-body"
      )}
    >
      {logoUrl ? (
        <ThemeAwareLogo
          lightSrc={logoUrl}
          darkSrc={logoDarkUrl}
          alt={logoOnly ? title : ""}
          className={cn("mx-auto shrink-0", logoOnly || logoSize === "lg" ? logoBox : "h-8 w-[120px]")}
        />
      ) : showLogo ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-600)">
          <Sparkles className="size-4" aria-hidden />
        </span>
      ) : null}
      {logoOnly ? (
        <span className="sr-only">{title}</span>
      ) : null}
      {logoOnly && subtitle ? (
        <span className="mt-0.5 block max-w-[9rem] truncate text-[10px] leading-none text-(--color-text-tertiary)">
          {subtitle}
        </span>
      ) : null}
      {!logoOnly ? (
        <span className="min-w-0 text-left">
          <span className="block font-bold leading-tight tracking-[0.12em] text-(--color-text-primary)">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-[10px] leading-none text-(--color-text-tertiary)">
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
