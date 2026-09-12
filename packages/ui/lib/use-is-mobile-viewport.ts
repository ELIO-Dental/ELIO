"use client";

import * as React from "react";
import { useIsomorphicLayoutEffect } from "./use-isomorphic-layout-effect";

// F.2 Final QA (2026-08-29): every shell-layout.tsx copy (shell/pay/plans/
// flow) initialized the Sidebar's `collapsed` state to a hardcoded `false`
// regardless of viewport width — confirmed live via a real 375px screenshot:
// the full 240px-wide expanded sidebar ate roughly 2/3 of the mobile
// viewport on every authenticated screen, a genuine, previously-unverified
// responsiveness gap. This shared hook lets each app default the sidebar to
// collapsed on a narrow viewport without duplicating the same
// matchMedia/resize-listener logic four times (FR-8: shared logic belongs in
// packages/, not copy-pasted per app).
//
// 768px matches THEME_GUIDELINE.md's own tablet breakpoint — same threshold
// already used throughout this codebase's own responsive Tailwind classes
// (e.g. sm:/md: usage across apps/shell/app/launcher/page.tsx).
const MOBILE_BREAKPOINT_PX = 768;

export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  // useLayoutEffect (not useEffect) — the initial `false` is only correct
  // for SSR/the very first hydration paint; on a genuinely narrow viewport
  // the corrected value must land BEFORE the browser paints, or the
  // Sidebar's motion-animated width visibly slides from 240px to 72px on
  // every mobile page load (found in a 2026-09-12 UI-stability review —
  // this hook's own history comment above already fixed one hardcoded-false
  // bug; this closes the remaining "flashes wrong for one frame" version of
  // the same defect).
  useIsomorphicLayoutEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
