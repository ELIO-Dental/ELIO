"use client";

import * as React from "react";
import { Download, Check, Monitor, Share } from "lucide-react";
import { getSafariInstallInstructions, usePwaInstall } from "../hooks/use-pwa-install";
import type { PwaAppConfig } from "../lib/config";

export interface PwaInstallButtonProps {
  config: PwaAppConfig;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
  showIcon?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-md) font-medium transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-60";

const variants = {
  primary:
    "bg-(--color-primary-button-bg) text-(--color-primary-button-fg) shadow-(--shadow-xs) hover:bg-(--color-primary-button-bg-hover)",
  secondary:
    "border border-(--color-border) bg-(--color-surface) text-(--color-text-primary) shadow-(--shadow-xs) hover:bg-(--color-bg-subtle)",
  outline:
    "border border-(--color-primary-500) bg-(--color-surface) text-(--color-primary-fg) shadow-(--shadow-xs) hover:bg-(--color-primary-50)",
};

const sizes = {
  sm: "h-8 px-3 text-body-sm",
  md: "h-10 px-4 text-body",
  lg: "h-12 px-6 text-body-lg",
};

/** Desktop / Safari PWA install CTA. */
export function PwaInstallButton({
  config,
  variant = "primary",
  size = "md",
  className = "",
  showIcon = true,
}: PwaInstallButtonProps) {
  const { state, install, canInstall, isInstalled, isSafari } = usePwaInstall();
  const [busy, setBusy] = React.useState(false);

  async function handleInstall() {
    setBusy(true);
    try {
      if (isSafari) {
        window.alert(getSafariInstallInstructions(config.name));
        return;
      }
      const accepted = await install();
      if (!accepted) {
        window.alert(
          `To install ${config.name}:\n\n` +
            "• Chrome / Edge: click the install icon in the address bar, or Menu → Install app\n" +
            "• Safari (macOS): File → Add to Dock\n" +
            "• Safari (iPhone/iPad): Share → Add to Home Screen"
        );
      }
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported") {
    return (
      <button type="button" disabled className={`${base} ${variants.secondary} ${sizes[size]} ${className}`}>
        {showIcon && <Monitor className="size-4" aria-hidden />}
        Install not supported in this browser
      </button>
    );
  }

  if (isInstalled) {
    return (
      <button type="button" disabled className={`${base} ${variants.secondary} ${sizes[size]} ${className}`} data-testid="pwa-installed">
        {showIcon && <Check className="size-4 text-(--color-success)" aria-hidden />}
        Installed on this device
      </button>
    );
  }

  const label = isSafari
    ? `Add ${config.shortName} from Safari`
    : canInstall
      ? `Install ${config.shortName}`
      : `Install ${config.shortName}`;

  return (
    <button
      type="button"
      onClick={handleInstall}
      disabled={busy}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      data-testid="pwa-install-button"
    >
      {showIcon && (isSafari ? <Share className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />)}
      {busy ? "Opening…" : label}
    </button>
  );
}
