"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "../lib/cn";
import type { ThemeMode } from "../lib/theme";
import { useTheme } from "./theme-provider";

const OPTIONS: { mode: ThemeMode; label: string; description: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", description: "Bright surfaces for well-lit spaces.", icon: Sun },
  { mode: "dark", label: "Dark", description: "Reduced glare for low-light environments.", icon: Moon },
  { mode: "system", label: "System", description: "Follow your device appearance setting.", icon: Monitor },
];

/** Portal / settings appearance picker — syncs across ELIO zones via localStorage. */
export function AppearanceSettings({ className }: { className?: string }) {
  const { theme, setTheme, mounted } = useTheme();

  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)} role="radiogroup" aria-label="Color theme">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const selected = mounted && theme === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.mode)}
            className={cn(
              "flex flex-col items-start gap-3 rounded-(--radius-lg) border p-4 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-500) focus-visible:ring-offset-2",
              selected
                ? "border-(--color-primary-600) bg-(--color-primary-50) shadow-(--shadow-sm) ring-1 ring-(--color-primary-500)/25"
                : "border-(--color-border) bg-(--color-surface) shadow-(--shadow-xs) hover:border-(--color-text-tertiary) hover:bg-(--color-bg-subtle) hover:shadow-(--shadow-sm)"
            )}
            data-testid={`theme-option-${option.mode}`}
          >
            <span
              className={cn(
                "flex size-10 items-center justify-center rounded-(--radius-md)",
                selected ? "bg-(--color-primary-button-bg) text-(--color-primary-button-fg)" : "bg-(--color-bg-subtle) text-(--color-text-primary)"
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-body font-semibold text-(--color-text-primary)">{option.label}</span>
              <span className="mt-1 block text-body-sm leading-relaxed text-(--color-text-secondary)">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
