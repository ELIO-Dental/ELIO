"use client";

import * as React from "react";

/**
 * `useLayoutEffect` on the client, `useEffect` during SSR (where
 * `useLayoutEffect` is a no-op and React warns about it — this avoids that
 * warning without losing the point of using it).
 *
 * The reason to prefer this over plain `useEffect` for anything that
 * corrects an SSR-safe-but-possibly-wrong initial value (viewport width,
 * dark-mode from a `document.documentElement` attribute, etc.): `useEffect`
 * runs AFTER the browser has already painted the first frame, so correcting
 * state there is visibly a flash/pop — the user briefly sees the wrong
 * value. `useLayoutEffect` runs synchronously after the DOM is updated but
 * BEFORE the browser paints, so the same correction is invisible (found in
 * a 2026-09-12 UI-stability review: `useIsMobileViewport`/`useIsDark` both
 * used the flash-causing `useEffect` version).
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;
