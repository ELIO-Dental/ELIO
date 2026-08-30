"use client";

import * as React from "react";
import type { PwaAppConfig } from "../lib/config";

interface PwaProviderProps {
  config: PwaAppConfig;
  children: React.ReactNode;
}

/** Registers the zone service worker and surfaces update prompts. */
export function PwaProvider({ config, children }: PwaProviderProps) {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

    let cancelled = false;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register(config.serviceWorkerPath, {
          scope: config.scope,
        });

        if (cancelled) return;

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });
      } catch {
        // SW registration can fail on unsupported browsers or HTTP — non-fatal.
      }
    }

    void register();

    return () => {
      cancelled = true;
    };
  }, [config.scope, config.serviceWorkerPath]);

  return <>{children}</>;
}
