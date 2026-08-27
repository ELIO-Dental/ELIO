"use client";

import * as React from "react";
import { cn } from "../lib/cn";

/**
 * Shared skeleton primitive — THEME_GUIDELINE.md §6.6, implemented EXACTLY:
 *  - debounce 300ms before showing anything (fetch <300ms → straight to content, no flash)
 *  - once shown, stays visible a minimum of 400ms even if data arrives sooner
 *  - dimensions match final content (caller passes width/height/className)
 *
 * Usage: `useSkeleton(isLoading)` returns whether to actually render the skeleton;
 * render <Skeleton /> only when that's true, and the real content otherwise.
 */
export function useSkeleton(isLoading: boolean, debounceMs = 300, minDisplayMs = 400) {
  const [show, setShow] = React.useState(false);
  const shownAtRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let minDurationTimer: ReturnType<typeof setTimeout> | undefined;

    if (isLoading) {
      debounceTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShow(true);
      }, debounceMs);
    } else if (show && shownAtRef.current) {
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = Math.max(0, minDisplayMs - elapsed);
      minDurationTimer = setTimeout(() => {
        setShow(false);
        shownAtRef.current = null;
      }, remaining);
    } else {
      setShow(false);
    }

    return () => {
      clearTimeout(debounceTimer);
      clearTimeout(minDurationTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return show;
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[--radius-md] bg-[length:200%_100%]",
        className
      )}
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--color-border-subtle) 25%, var(--color-border) 50%, var(--color-border-subtle) 75%)",
        animation: "shimmer 1.6s ease-in-out infinite",
      }}
      aria-hidden
      {...props}
    />
  );
}
