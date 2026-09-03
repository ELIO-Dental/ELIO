"use client";

import * as React from "react";
import { Download, Check, Share } from "lucide-react";
import { getSafariInstallInstructions, usePwaInstall } from "../hooks/use-pwa-install";
import type { PwaAppConfig } from "../lib/config";

/** Compact install control for sidebar footers — works on Chrome and Safari. */
export function PwaSidebarInstall({ config, collapsed }: { config: PwaAppConfig; collapsed: boolean }) {
  const { state, install, isInstalled, canInstall, isSafari } = usePwaInstall();

  if (state === "unsupported") return null;

  async function handleClick() {
    if (isInstalled) return;
    if (isSafari) {
      window.alert(getSafariInstallInstructions(config.name));
      return;
    }
    const accepted = await install();
    if (!accepted) {
      window.alert(
        canInstall
          ? `Use your browser menu or address bar to install ${config.shortName}.`
          : getSafariInstallInstructions(config.shortName)
      );
    }
  }

  const label = isInstalled
    ? "App installed"
    : isSafari
      ? `Add ${config.shortName}`
      : `Install ${config.shortName}`;

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
      {isInstalled ? (
        <Check className="size-4 shrink-0 text-(--color-success)" aria-hidden />
      ) : isSafari ? (
        <Share className="size-4 shrink-0" aria-hidden />
      ) : (
        <Download className="size-4 shrink-0" aria-hidden />
      )}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
