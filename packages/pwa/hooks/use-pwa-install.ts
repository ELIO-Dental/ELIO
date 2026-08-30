"use client";

import * as React from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type PwaInstallState = "unsupported" | "installed" | "installable" | "idle";

export function usePwaInstall() {
  const [state, setState] = React.useState<PwaInstallState>("idle");
  const deferredRef = React.useRef<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (isStandaloneDisplay()) {
      setState("installed");
      return;
    }

    if (!("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      deferredRef.current = event as BeforeInstallPromptEvent;
      setState("installable");
    };

    const onInstalled = () => {
      deferredRef.current = null;
      setState("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = React.useCallback(async () => {
    const prompt = deferredRef.current;
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      deferredRef.current = null;
      setState("installed");
      return true;
    }
    return false;
  }, []);

  return { state, install, isInstalled: state === "installed", canInstall: state === "installable" };
}
