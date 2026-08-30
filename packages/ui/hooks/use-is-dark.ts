"use client";

import * as React from "react";
import { isDarkModeActive } from "../lib/theme";
import { useTheme } from "../components/theme-provider";

/** Resolves whether the UI is currently in dark mode (explicit or system). */
export function useIsDark(): boolean {
  const { theme, mounted } = useTheme();
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    if (!mounted) return;
    setDark(isDarkModeActive());
  }, [theme, mounted]);

  React.useEffect(() => {
    if (!mounted || theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, mounted]);

  return dark;
}
