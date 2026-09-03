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

/** Safari (macOS / iOS) — no beforeinstallprompt; Add to Dock / Home Screen only. */
export function isSafariBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR|Opera/i.test(ua);
  return isSafari;
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function getSafariInstallInstructions(appName: string): string {
  if (isIosDevice()) {
    return (
      `Install ${appName} from Safari:\n\n` +
      "1. Tap the Share button (square with an arrow)\n" +
      '2. Scroll and tap "Add to Home Screen"\n' +
      "3. Tap Add — the app opens like a native app"
    );
  }
  return (
    `Install ${appName} from Safari (macOS):\n\n` +
    "1. Open the File menu (or Share toolbar button)\n" +
    '2. Choose "Add to Dock"\n' +
    "3. Open it from the Dock — runs as a standalone app"
  );
}

export type PwaInstallState = "unsupported" | "installed" | "installable" | "safari" | "idle";

export function usePwaInstall() {
  const [state, setState] = React.useState<PwaInstallState>("idle");
  const deferredRef = React.useRef<BeforeInstallPromptEvent | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (isStandaloneDisplay()) {
      setState("installed");
      return;
    }

    // Safari: no beforeinstallprompt — still fully installable via Add to Dock / Home Screen.
    if (isSafariBrowser()) {
      setState("safari");
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
    if (state === "safari") {
      return false;
    }
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
  }, [state]);

  return {
    state,
    install,
    isInstalled: state === "installed",
    canInstall: state === "installable",
    isSafari: state === "safari",
  };
}
