"use client";

import * as React from "react";
import { isDarkModeActive } from "../lib/theme";
import { useTheme } from "../components/theme-provider";
import { useIsomorphicLayoutEffect } from "../lib/use-isomorphic-layout-effect";

/** Resolves whether the UI is currently in dark mode (explicit or system). */
export function useIsDark(): boolean {
  const { theme, mounted } = useTheme();
  const [dark, setDark] = React.useState(false);

  // useLayoutEffect (not useEffect) — ThemeScript already sets
  // document.documentElement's data-theme attribute synchronously before
  // first paint (no document-level flash), but `dark` here starts `false`
  // regardless and only becomes correct once this runs. On a real dark-mode
  // user's first paint, every consumer that branches on this value (sidebar
  // active-nav accent, launcher tile badge/glow colors) rendered its LIGHT
  // variant for one frame before popping to dark. Correcting before paint
  // (not after) removes that pop (found in a 2026-09-12 UI-stability
  // review, same root cause as useIsMobileViewport's identical fix).
  useIsomorphicLayoutEffect(() => {
    if (!mounted) return;
    setDark(isDarkModeActive());
  }, [theme, mounted]);

  useIsomorphicLayoutEffect(() => {
    if (!mounted || theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, mounted]);

  return dark;
}
