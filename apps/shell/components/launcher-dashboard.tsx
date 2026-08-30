"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  LayoutGrid,
  Lock,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  ModuleAccentChip,
  ModuleIconBadge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  getModuleColor,
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

function daysLeft(trialEndsAt: Date): number {
  return Math.max(1, Math.ceil((trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function WelcomeBanner({ displayName }: { displayName: string }) {
  return (
    <header className="relative overflow-hidden rounded-(--radius-xl) border border-(--color-primary-200)/60 bg-linear-to-br from-(--color-primary-50) via-(--color-surface) to-(--color-primary-100)/40 p-8 shadow-(--shadow-sm) md:p-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <svg className="absolute -right-8 top-0 h-full w-[min(52%,22rem)] opacity-[0.35]" viewBox="0 0 400 200" fill="none">
          <path
            d="M0 120C80 80 160 160 240 100C300 60 360 40 400 20V200H0V120Z"
            fill="url(#portal-wave)"
          />
          <circle cx="320" cy="48" r="56" fill="var(--color-primary-500)" fillOpacity="0.08" />
          <circle cx="280" cy="120" r="32" fill="var(--color-primary-500)" fillOpacity="0.06" />
          <defs>
            <linearGradient id="portal-wave" x1="0" y1="0" x2="400" y2="200">
              <stop stopColor="var(--color-primary-400)" stopOpacity="0.25" />
              <stop offset="1" stopColor="var(--color-primary-600)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="relative max-w-2xl">
        <p className="inline-flex items-center gap-2 rounded-(--radius-full) border border-(--color-primary-200)/80 bg-(--color-surface)/80 px-3 py-1 text-caption font-semibold text-(--color-primary-700) shadow-(--shadow-xs) backdrop-blur-sm">
          <Sparkles className="size-3.5 text-(--color-primary-600)" aria-hidden />
          ELIO Portal
        </p>
        <h1 className="mt-5 text-h1 text-(--color-text-primary)">
          Welcome back
          {displayName !== "there" ? (
            <>
              , <span className="text-(--color-primary-600)">{displayName}</span>
            </>
          ) : null}
        </h1>
        <p className="mt-3 max-w-xl text-body leading-relaxed text-(--color-text-secondary)">
          Access your ELIO platform suite — pick a module to open its workspace.
        </p>
      </div>
    </header>
  );
}

function ModuleCard({ mod }: { mod: LauncherModule }) {
  const color = getModuleColor(mod.moduleId);
  const letter = mod.name.replace("Elio", "").slice(0, 1);

  const card = (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-(--radius-xl) border border-(--color-border-subtle) bg-(--color-surface) p-6 shadow-(--shadow-sm) transition-[box-shadow,transform,border-color] duration-200 ${
        mod.licensed ? "hover:-translate-y-0.5 hover:border-(--color-primary-200) hover:shadow-(--shadow-md)" : "opacity-55 grayscale"
      }`}
    >
      <div
        className="pointer-events-none absolute -bottom-6 -right-4 size-32 rounded-full opacity-50 blur-2xl"
        style={{ backgroundColor: color.badgeLight.bg }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <ModuleIconBadge moduleId={mod.moduleId} size="lg">
          {letter}
        </ModuleIconBadge>
        {mod.licensed ? (
          <ModuleAccentChip moduleId={mod.moduleId} className="size-9 transition-transform group-hover:scale-110">
            <ArrowUpRight className="size-4" aria-hidden />
          </ModuleAccentChip>
        ) : (
          <span className="flex size-9 items-center justify-center rounded-(--radius-full) bg-(--color-bg-subtle) text-(--color-text-tertiary)">
            <Lock className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <h3 className="relative mt-5 text-h3 text-(--color-text-primary)">{mod.name}</h3>
      <p className="relative mt-2 flex-1 text-body-sm leading-relaxed text-(--color-text-secondary)">{mod.description}</p>
      {mod.licensed && mod.trialEndsAt && (
        <Badge variant="warning" className="relative mt-4 w-fit" data-testid={`trial-badge-${mod.moduleId}`}>
          Trial — {daysLeft(mod.trialEndsAt)} day{daysLeft(mod.trialEndsAt) === 1 ? "" : "s"} left
        </Badge>
      )}
      {!mod.licensed && (
        <p className="relative mt-4 text-caption font-medium text-(--color-text-tertiary)">No active licence</p>
      )}
      {mod.licensed && (
        <p className="relative mt-6 inline-flex items-center gap-1.5 text-body-sm font-semibold text-(--color-primary-600) transition-colors group-hover:text-(--color-primary-700)">
          Open Workspace
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </p>
      )}
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
    <Link href={mod.href} data-testid={`launcher-tile-${mod.moduleId}`} className="block h-full">
      {card}
    </Link>
  );
}

export function LauncherDashboard({
  displayName,
  modules,
}: {
  displayName: string;
  modules: LauncherModule[];
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 pb-10 lg:px-10 lg:py-10">
      <WelcomeBanner displayName={displayName} />

      <section className="mt-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-h2 text-(--color-text-primary)">Your ELIO Products</h2>
            <div className="mt-2 h-1 w-12 rounded-(--radius-full) bg-(--color-primary-500)" aria-hidden />
            <p className="mt-3 text-body-sm text-(--color-text-secondary)">Licensed modules for your practice</p>
          </div>
          <Link
            href="/settings"
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-3.5 text-body-sm font-medium text-(--color-text-secondary) shadow-(--shadow-xs) transition-colors hover:border-(--color-primary-300) hover:bg-(--color-bg-subtle) hover:text-(--color-text-primary) sm:self-auto"
          >
            <LayoutGrid className="size-4" aria-hidden />
            Customize
          </Link>
        </div>

        <TooltipProvider>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="launcher-grid">
            {modules.map((mod) => (
              <ModuleCard key={mod.moduleId} mod={mod} />
            ))}
          </div>
        </TooltipProvider>
      </section>

      <footer className="mt-10 flex flex-col gap-3 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-bg-subtle)/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-surface) text-(--color-primary-600) shadow-(--shadow-xs)">
            <Shield className="size-4" aria-hidden />
          </span>
          <p className="text-body-sm leading-relaxed text-(--color-text-secondary)">
            Your data is secure and encrypted. ELIO Portal uses enterprise-grade security to protect your information.
          </p>
        </div>
        <Link
          href="/settings/support"
          className="shrink-0 text-body-sm font-semibold text-(--color-primary-600) hover:text-(--color-primary-700)"
        >
          Learn more &gt;
        </Link>
      </footer>
    </div>
  );
}
