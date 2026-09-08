"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ClipboardList,
  CreditCard,
  Kanban,
  LayoutGrid,
  Lock,
  Shield,
} from "lucide-react";
import {
  Badge,
  ModuleIconBadge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  getModuleColor,
  useIsDark,
  type ModuleId,
} from "@elio/ui";

export interface LauncherModule {
  moduleId: ModuleId;
  name: string;
  description: string;
  href: string;
  licensed: boolean;
  trialEndsAt: Date | null;
}

const MODULE_ICONS: Partial<Record<ModuleId, LucideIcon>> = {
  pay: CreditCard,
  plans: ClipboardList,
  flow: Kanban,
};

function daysLeft(trialEndsAt: Date): number {
  return Math.max(1, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function productLabel(name: string): string {
  return name.replace(/^Elio/i, "").trim() || name;
}

function WelcomeBanner({ displayName }: { displayName: string }) {
  return (
    <header className="portal-welcome relative overflow-hidden rounded-(--radius-xl) border border-(--color-border-subtle) px-7 py-7 md:px-9 md:py-8">
      <div className="portal-welcome-glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="portal-welcome-edge pointer-events-none absolute inset-x-0 bottom-0 h-px" aria-hidden />
      <div className="relative">
        <p className="text-caption font-semibold tracking-[0.14em] text-(--color-primary-fg-muted) uppercase">
          ELIO Portal
        </p>
        <h1 className="mt-3 max-w-2xl text-h1 text-(--color-text-primary)">
          Welcome back
          {displayName !== "there" ? (
            <>
              , <span className="text-(--color-primary-fg)">{displayName}</span>
            </>
          ) : null}
        </h1>
        <p className="mt-2.5 max-w-lg text-body leading-relaxed text-(--color-text-secondary)">
          Open a product workspace below — your licensed ELIO suite in one place.
        </p>
      </div>
    </header>
  );
}

function ModuleCard({
  mod,
  dentallyConnected,
  index,
}: {
  mod: LauncherModule;
  dentallyConnected: boolean;
  index: number;
}) {
  const isDark = useIsDark();
  const color = getModuleColor(mod.moduleId);
  const badge = isDark ? color.badgeDark : color.badgeLight;
  const Icon = MODULE_ICONS[mod.moduleId];
  const letter = productLabel(mod.name).slice(0, 1);
  const delayMs = 40 + index * 55;
  const accentFg = badge.fg;
  const glowRgb = `rgba(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]}, ${isDark ? 0.22 : 0.1})`;

  const card = (
    <article
      className={`launcher-card group relative flex h-full flex-col overflow-hidden rounded-(--radius-xl) border bg-(--color-surface) shadow-(--shadow-sm) transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out ${
        mod.licensed
          ? "is-licensed border-(--color-border-subtle) hover:-translate-y-1 hover:border-(--color-border) hover:bg-(--color-surface-raised)"
          : "border-(--color-border-subtle) opacity-55 grayscale"
      }`}
      style={
        {
          animationDelay: `${delayMs}ms`,
          ["--module-accent" as string]: color.hex,
          ["--module-accent-fg" as string]: accentFg,
        } as CSSProperties
      }
    >
      <div
        className="h-1.5 w-full shrink-0"
        style={{
          background: `linear-gradient(90deg, ${color.hex}, color-mix(in srgb, ${color.hex} ${isDark ? "55%" : "35%"}, transparent))`,
        }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col p-6 pt-5 md:p-7 md:pt-6">
        <div
          className="pointer-events-none absolute -right-10 -top-12 size-48 rounded-full blur-3xl transition-opacity duration-300"
          style={{
            backgroundColor: glowRgb,
            opacity: `calc(0.75 * var(--portal-glow-strength))`,
          }}
          aria-hidden
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <ModuleIconBadge
              moduleId={mod.moduleId}
              size="xl"
              className="ring-1 ring-(--color-border-subtle) transition-transform duration-300 group-hover:scale-[1.04]"
            >
              {Icon ? <Icon className="size-6" strokeWidth={2.1} aria-hidden /> : letter}
            </ModuleIconBadge>
            <div className="min-w-0">
              <p className="text-caption font-semibold tracking-wide text-(--color-text-tertiary) uppercase">
                Product
              </p>
              <h3 className="mt-0.5 truncate text-h3 text-(--color-text-primary)">{mod.name}</h3>
            </div>
          </div>
          {!mod.licensed ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) text-(--color-text-tertiary)">
              <Lock className="size-4" aria-hidden />
            </span>
          ) : null}
        </div>

        <p className="relative mt-5 flex-1 text-body-sm leading-relaxed text-(--color-text-secondary)">
          {mod.description}
        </p>

        <div className="relative mt-5 flex flex-wrap gap-2">
          {mod.licensed && dentallyConnected ? (
            <Badge variant="success" className="w-fit" data-testid={`dentally-connected-${mod.moduleId}`}>
              Dentally connected
            </Badge>
          ) : null}
          {mod.licensed && mod.trialEndsAt ? (
            <Badge variant="warning" className="w-fit" data-testid={`trial-badge-${mod.moduleId}`}>
              Trial — {daysLeft(mod.trialEndsAt)} day{daysLeft(mod.trialEndsAt) === 1 ? "" : "s"} left
            </Badge>
          ) : null}
          {!mod.licensed ? (
            <p className="text-caption font-medium text-(--color-text-tertiary)">No active licence</p>
          ) : null}
        </div>

        {mod.licensed ? (
          <div
            className="relative mt-6 flex items-center justify-between gap-3 rounded-(--radius-md) border border-(--color-border-subtle)/80 px-3.5 py-3 transition-[background-color,border-color] duration-200 group-hover:border-transparent"
            style={{
              backgroundColor: `color-mix(in srgb, var(--module-accent) var(--portal-cta-mix), var(--color-surface))`,
            }}
          >
            <span className="text-body-sm font-semibold" style={{ color: accentFg }}>
              Open Workspace
            </span>
            <span
              className="flex size-8 items-center justify-center rounded-(--radius-md) text-white shadow-(--shadow-xs) transition-transform duration-200 group-hover:translate-x-0.5"
              style={{ backgroundColor: color.hex }}
              aria-hidden
            >
              <ArrowRight className="size-4" />
            </span>
          </div>
        ) : null}
      </div>

      {mod.licensed ? (
        <div
          className="pointer-events-none absolute inset-0 rounded-(--radius-xl) opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${color.hex} var(--portal-ring-mix), transparent)`,
          }}
          aria-hidden
        />
      ) : null}
    </article>
  );

  if (!mod.licensed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div data-testid={`launcher-tile-${mod.moduleId}`} data-locked="true" className="h-full cursor-not-allowed">
            {card}
          </div>
        </TooltipTrigger>
        <TooltipContent>Contact admin to enable</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={mod.href}
      data-testid={`launcher-tile-${mod.moduleId}`}
      className="block h-full rounded-(--radius-xl) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-400) focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-subtle)"
    >
      {card}
    </Link>
  );
}

export function LauncherDashboard({
  displayName,
  modules,
  dentallyConnected = false,
}: {
  displayName: string;
  modules: LauncherModule[];
  dentallyConnected?: boolean;
}) {
  return (
    <div className="launcher-page relative mx-auto w-full max-w-6xl px-6 py-8 pb-12 lg:px-10 lg:py-10">
      <WelcomeBanner displayName={displayName} />

      <section className="mt-11">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span
                className="size-2 rounded-(--radius-full) bg-(--color-primary-button-bg)"
                aria-hidden
              />
              <h2 className="text-h2 text-(--color-text-primary)">Your ELIO Products</h2>
            </div>
            <p className="mt-2 max-w-md text-body-sm text-(--color-text-secondary)">
              Choose a module to enter its full workspace
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-4 text-body-sm font-medium text-(--color-text-primary) shadow-(--shadow-xs) transition-[border-color,background-color,color] hover:border-(--color-primary-200) hover:bg-(--color-primary-50) hover:text-(--color-primary-fg) sm:self-auto"
          >
            <LayoutGrid className="size-4 text-(--color-primary-fg-muted)" aria-hidden />
            Customize
          </Link>
        </div>

        <TooltipProvider>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3" data-testid="launcher-grid">
            {modules.map((mod, index) => (
              <ModuleCard
                key={mod.moduleId}
                mod={mod}
                dentallyConnected={dentallyConnected}
                index={index}
              />
            ))}
          </div>
        </TooltipProvider>
      </section>

      <footer className="mt-12 flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface)/85 px-5 py-4 shadow-(--shadow-xs) backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) text-(--color-primary-fg)">
            <Shield className="size-4" aria-hidden />
          </span>
          <p className="text-body-sm leading-relaxed text-(--color-text-secondary)">
            Practice data stays encrypted in transit and at rest. ELIO Portal is built for clinic-grade security.
          </p>
        </div>
        <Link
          href="/settings/support"
          className="shrink-0 text-body-sm font-semibold text-(--color-primary-fg) transition-colors hover:text-(--color-primary-fg-muted)"
        >
          Learn more →
        </Link>
      </footer>
    </div>
  );
}
