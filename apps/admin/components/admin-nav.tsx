"use client";

import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { PwaInstallButton, getPwaConfig } from "@elio/pwa";

const pwa = getPwaConfig("admin");

/** Minimal chrome for the internal-only Super Admin console — deliberately
 * plain/utilitarian, not styled to match the clinic-facing shell (THEME_
 * GUIDELINE.md's module-color system explicitly never applies here; this is
 * ELIO's own internal tool, not a tenant-facing surface). */
export function AdminNav({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-(--color-bg)">
      <header className="sticky top-0 z-[1100] border-b border-(--color-border) bg-(--color-surface) px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/" className="text-h3 font-semibold text-(--color-text-primary)">
            ELIO <span className="text-(--color-text-tertiary)">Super Admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <PwaInstallButton config={pwa} variant="outline" size="sm" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
