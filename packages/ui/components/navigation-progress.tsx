"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { cn } from "../lib/cn";

function isInternalNavigation(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;

  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    const current = window.location;
    return url.pathname !== current.pathname || url.search !== current.search;
  } catch {
    return false;
  }
}

function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const pendingNav = React.useRef(false);
  const isFirstRoute = React.useRef(true);

  const finish = React.useCallback(() => {
    setProgress(100);
    window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
      pendingNav.current = false;
    }, reduceMotion ? 0 : 180);
  }, [reduceMotion]);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || !isInternalNavigation(anchor)) return;

      pendingNav.current = true;
      setVisible(true);
      setProgress(reduceMotion ? 90 : 18);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [reduceMotion]);

  React.useEffect(() => {
    if (!visible || reduceMotion || progress >= 90) return;

    const id = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 90) return current;
        const step = Math.max(2, (90 - current) * 0.12);
        return Math.min(90, current + step);
      });
    }, 160);

    return () => window.clearInterval(id);
  }, [visible, progress, reduceMotion]);

  React.useEffect(() => {
    if (isFirstRoute.current) {
      isFirstRoute.current = false;
      return;
    }

    if (pendingNav.current || visible) {
      finish();
    }
  }, [pathname, searchParams, finish, visible]);

  React.useEffect(() => {
    if (!visible) return;
    const safety = window.setTimeout(finish, 12_000);
    return () => window.clearTimeout(safety);
  }, [visible, finish]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] overflow-hidden bg-transparent"
      role="progressbar"
      aria-hidden="true"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
    >
      <div
        className={cn(
          "h-full origin-left bg-(--color-primary-500)",
          reduceMotion ? "transition-none" : "transition-[width] duration-200 ease-out"
        )}
        style={{
          width: `${progress}%`,
          boxShadow: "0 0 8px color-mix(in srgb, var(--color-primary-500) 65%, transparent)",
        }}
      />
    </div>
  );
}

/** Thin top loading bar for in-app navigations (sidebar tabs, settings links, etc.). */
export function NavigationProgress() {
  return (
    <React.Suspense fallback={null}>
      <NavigationProgressBar />
    </React.Suspense>
  );
}
