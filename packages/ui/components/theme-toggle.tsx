"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { useTheme } from "./theme-provider";

function isDarkModeActive(): boolean {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Compact light/dark toggle for portal and module chrome (top-right). */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, mounted } = useTheme();
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    setDark(isDarkModeActive());
  }, [theme, mounted]);

  React.useEffect(() => {
    if (!mounted || theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, mounted]);

  function toggle() {
    const nextDark = !isDarkModeActive();
    setDark(nextDark);
    setTheme(nextDark ? "dark" : "light");
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("size-9 shrink-0 border-(--color-border) bg-(--color-surface) px-0 shadow-(--shadow-sm)", className)}
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="theme-toggle"
    >
      {mounted ? (
        dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4 opacity-50" aria-hidden />
      )}
    </Button>
  );
}
