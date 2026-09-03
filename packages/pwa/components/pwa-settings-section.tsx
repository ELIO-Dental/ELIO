"use client";

import * as React from "react";
import { Monitor, WifiOff } from "lucide-react";
import type { PwaAppConfig } from "../lib/config";
import { PwaInstallButton } from "./pwa-install-button";

/** Settings card for desktop PWA install — portal settings page. */
export function PwaSettingsSection({ config }: { config: PwaAppConfig }) {
  return (
    <div className="space-y-5">
      <p className="text-body-sm leading-relaxed text-(--color-text-secondary)">
        Install {config.name} on your desktop for a dedicated app window, faster launch from your taskbar or dock,
        and the same experience as the web app. ELIO is built for desktop use in the practice.
      </p>

      <ul className="grid gap-3 sm:grid-cols-2">
        <li className="flex gap-3 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle)/60 p-3">
          <Monitor className="mt-0.5 size-4 shrink-0 text-(--color-primary-600)" aria-hidden />
          <span className="text-body-sm text-(--color-text-secondary)">
            <strong className="font-medium text-(--color-text-primary)">Standalone window</strong>
            <br />
            Opens without browser tabs — ideal for front-desk desktops.
          </span>
        </li>
        <li className="flex gap-3 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle)/60 p-3">
          <WifiOff className="mt-0.5 size-4 shrink-0 text-(--color-primary-600)" aria-hidden />
          <span className="text-body-sm text-(--color-text-secondary)">
            <strong className="font-medium text-(--color-text-primary)">Offline awareness</strong>
            <br />
            Shows a clear message when your connection drops — data stays secure.
          </span>
        </li>
      </ul>

      <PwaInstallButton config={config} variant="primary" size="lg" />

      <p className="text-caption text-(--color-text-tertiary)">
        Chrome and Edge: one-click install from the button or address bar. Safari (Mac): File → Add to Dock. Safari
        (iPhone/iPad): Share → Add to Home Screen.
      </p>
    </div>
  );
}
