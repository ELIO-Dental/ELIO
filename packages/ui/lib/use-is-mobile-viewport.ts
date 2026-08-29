"use client";

import * as React from "react";

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

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return isMobile;
}
