"use client";

import * as React from "react";
import { NoiseOverlay, cn, ThemeToggle } from "@elio/ui";

export interface AuthShellProps {
  headline?: string;
  description?: string;
  wide?: boolean;
  children: React.ReactNode;
}

/** Premium split auth chrome — brand panel + centered form area. UI only. */
export function AuthShell({ headline, description, wide, children }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen bg-(--color-bg)">
      <div className="pointer-events-none absolute right-4 top-4 z-20 flex justify-end sm:right-6 sm:top-6">
        <div className="pointer-events-auto">
          <ThemeToggle />
        </div>
      </div>
      <aside className="relative hidden w-[44%] overflow-hidden border-r border-(--color-border-subtle) bg-(--color-bg-subtle) lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-14">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-24 -top-24 size-[28rem] rounded-full bg-(--color-primary-500)/25 blur-3xl" />
          <div className="absolute -bottom-16 right-0 size-80 rounded-full bg-(--color-accent-teal)/20 blur-3xl" />
          <div className="absolute right-1/4 top-1/3 size-56 rounded-full bg-(--color-primary-300)/20 blur-3xl" />
          <NoiseOverlay opacity={0.05} />
        </div>

        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/elio-portal.png"
            alt="ELIO Portal"
            className="h-10 w-auto max-w-[220px] object-contain"
            data-testid="auth-brand-logo"
          />
          <h1 className="mt-8 max-w-md text-display text-(--color-text-primary)">One platform for your whole practice.</h1>
          <p className="mt-4 max-w-sm text-body leading-relaxed text-(--color-text-secondary)">
            Payroll, patient plans, and workflow — secure, connected, and built for modern dental teams.
          </p>
        </div>

        <p className="relative text-caption text-(--color-text-tertiary)">Secure staff access · ELIO</p>
      </aside>

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10">
        <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden>
          <div className="absolute -right-20 top-0 size-72 rounded-full bg-(--color-primary-500)/12 blur-3xl" />
          <NoiseOverlay opacity={0.035} />
        </div>

        <div className={cn("relative w-full", wide ? "max-w-2xl" : "max-w-[440px]")}>
          <div className="mb-8 flex justify-center lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/elio-portal.png"
              alt="ELIO Portal"
              className="h-9 w-auto max-w-[200px] object-contain"
              data-testid="auth-brand-logo-mobile"
            />
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
