"use client";

import * as React from "react";
import { Download, Check } from "lucide-react";
import { usePwaInstall } from "../hooks/use-pwa-install";
import type { PwaAppConfig } from "../lib/config";

/** Compact install control for sidebar footers. */
export function PwaSidebarInstall({ config, collapsed }: { config: PwaAppConfig; collapsed: boolean }) {
  const { state, install, isInstalled, canInstall } = usePwaInstall();

  if (state === "unsupported") return null;

  async function handleClick() {
    if (isInstalled) return;
    const accepted = await install();
    if (!accepted && canInstall) {
      window.alert(`Use your browser menu or address bar to install ${config.shortName} on desktop.`);
    }
  }

  const label = isInstalled ? "App installed" : `Install ${config.shortName}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      disabled={isInstalled}
      className="flex h-10 w-full items-center gap-3 rounded-(--radius-md) px-3 text-body-sm font-medium text-(--color-text-secondary) transition-colors hover:bg-(--color-border-subtle) hover:text-(--color-text-primary) disabled:cursor-default disabled:opacity-80"
      data-testid="pwa-sidebar-install"
    >
      {isInstalled ? <Check className="size-4 shrink-0 text-(--color-success)" aria-hidden /> : <Download className="size-4 shrink-0" aria-hidden />}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
