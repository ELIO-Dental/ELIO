"use client";

import * as React from "react";
import { Shield } from "lucide-react";
import { NoiseOverlay, cn, ThemeToggle } from "@elio/ui";

export interface AuthShellProps {
  headline?: string;
  description?: string;
  children: React.ReactNode;
}

/** Premium split auth chrome for the Super Admin console. */
export function AuthShell({ headline, description, children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen bg-(--color-bg)">
      <div className="pointer-events-none absolute right-4 top-4 z-20 flex justify-end sm:right-6 sm:top-6">
        <div className="pointer-events-auto">
          <ThemeToggle />
        </div>
      </div>

      <aside className="relative hidden w-[44%] overflow-hidden border-r border-(--color-border-subtle) bg-(--color-bg-subtle) lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 -top-24 size-[28rem] rounded-full bg-(--color-primary-500)/20 blur-3xl" />
          <div className="absolute -bottom-16 right-0 size-80 rounded-full bg-(--color-accent-amber)/15 blur-3xl" />
          <NoiseOverlay opacity={0.05} />
        </div>

        <div className="relative">
          <p className="inline-flex items-center gap-2 text-body font-bold tracking-[0.22em] text-(--color-text-primary)">
            <span className="flex size-9 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-fg)">
              <Shield className="size-4" aria-hidden />
            </span>
            ELIO SUPER ADMIN
          </p>
          <h1 className="mt-8 max-w-md text-display text-(--color-text-primary)">Platform control centre.</h1>
          <p className="mt-4 max-w-sm text-body leading-relaxed text-(--color-text-secondary)">
            Manage tenants, licences, and feature flags across every ELIO practice — internal staff only.
          </p>
        </div>

        <p className="relative text-caption text-(--color-text-tertiary)">Restricted access · MFA required</p>
      </aside>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden>
          <div className="absolute -right-20 top-0 size-72 rounded-full bg-(--color-primary-500)/10 blur-3xl" />
          <NoiseOverlay opacity={0.035} />
        </div>

        <div className="relative w-full max-w-[440px]">
          <div className="mb-8 text-center lg:hidden">
            <p className="inline-flex items-center justify-center gap-2 text-body font-bold tracking-[0.18em] text-(--color-text-primary)">
              <Shield className="size-4 text-(--color-primary-fg)" aria-hidden />
              ELIO SUPER ADMIN
            </p>
          </div>

          {(headline || description) && (
            <div className="mb-8 text-center lg:text-left">
              {headline && <h2 className="text-h1 text-(--color-text-primary)">{headline}</h2>}
              {description && <p className="mt-2 text-body leading-relaxed text-(--color-text-secondary)">{description}</p>}
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthFormCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-(--radius-lg) border border-(--glass-border) bg-(--glass-bg) p-6 shadow-(--shadow-lg) backdrop-blur-[var(--glass-blur)] md:p-8",
        className
      )}
    >
      {title && <h3 className="mb-6 text-h3 text-(--color-text-primary)">{title}</h3>}
      {children}
    </div>
  );
}
